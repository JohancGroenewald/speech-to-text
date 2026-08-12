# Deployment

This service is deployed on `speech-to-text.huis` behind nginx. Fastify listens
only on `127.0.0.1:7077`; LAN clients use HTTPS on port 443.

## Prerequisites

- Node.js 20 or newer and npm;
- nginx;
- a checkout at `/opt/speech-to-text`;
- a Huis CA certificate for `speech-to-text.huis`;
- a dedicated `speech-to-text` system user and group.

The checked-in systemd unit expects Node.js at `/usr/local/bin/node`. Confirm the
path with `command -v node` and adjust the unit deliberately if the host differs.

## Runtime Files and Permissions

Secrets and mutable state live outside Git:

```text
/etc/speech-to-text/speech-to-text.env
/var/lib/speech-to-text/client-keys.json
/etc/ssl/huis/speech-to-text.huis.crt
/etc/ssl/huis/speech-to-text.huis.key
```

Create the service directories if they do not already exist:

```bash
sudo install -d -m 0750 -o root -g speech-to-text /etc/speech-to-text
sudo install -d -m 0750 -o speech-to-text -g speech-to-text /var/lib/speech-to-text
sudo install -d -m 0750 -o speech-to-text -g speech-to-text /var/log/speech-to-text
sudo install -d -m 0750 -o root -g root /etc/ssl/huis
```

The service must be able to create and atomically replace the managed key file
under `/var/lib/speech-to-text`. The systemd unit's `ProtectSystem=strict` and
`ReadWritePaths` settings intentionally make `/etc/speech-to-text` read-only to
the process.

## Install Dependencies and Validate

From the repository:

```bash
cd /opt/speech-to-text
npm ci
npm run validate
```

Do not restart a working service if validation fails.

## Configure the Environment

On a first installation, install the template, then fill the required secrets
and review every value. Do not copy the template over an existing environment
file; edit that file in place instead.

```bash
sudo install -m 0640 -o root -g speech-to-text \
  .env.example /etc/speech-to-text/speech-to-text.env
sudoedit /etc/speech-to-text/speech-to-text.env
```

Production settings should include:

```text
HOST=127.0.0.1
PORT=7077
OPENAI_API_KEY=<provider-secret>
TRANSCRIPTION_MODEL=gpt-4o-transcribe
SPEECH_TO_TEXT_API_KEYS=
CLIENT_KEYS_FILE=/var/lib/speech-to-text/client-keys.json
ADMIN_API_TOKEN=<separate-admin-secret>
MAX_AUDIO_BYTES=26214400
REQUEST_TIMEOUT_MS=120000
LOG_TRANSCRIPTS=false
```

Use a high-entropy admin token. `SPEECH_TO_TEXT_API_KEYS` may contain a temporary
bootstrap client token, but the normal deployed source is the managed hashed
key store. Remove bootstrap tokens after managed clients have been created.

## Install the systemd Unit

```bash
sudo cp deploy/systemd/speech-to-text.service \
  /etc/systemd/system/speech-to-text.service
sudo systemctl daemon-reload
sudo systemctl enable --now speech-to-text
sudo systemctl status speech-to-text
```

The unit runs as `speech-to-text`, grants read access to this service's journal
through `SupplementaryGroups=systemd-journal`, and restricts filesystem writes
to the runtime state directories.

## Install nginx

The checked-in site terminates Huis CA TLS and proxies to loopback. It allows a
26 MiB HTTP body so multipart framing fits around the API's 25 MiB audio-file
limit.

```bash
sudo cp deploy/nginx/speech-to-text.conf \
  /etc/nginx/sites-available/speech-to-text
sudo ln -sfn /etc/nginx/sites-available/speech-to-text \
  /etc/nginx/sites-enabled/speech-to-text
sudo nginx -t
sudo systemctl reload nginx
```

Remove another enabled default site only after confirming that it is not needed
for any other hostname. Fastify trusts forwarded client addresses only when the
immediate peer is loopback, matching this nginx topology.

## TLS Certificate

The nginx definition expects:

```text
/etc/ssl/huis/speech-to-text.huis.crt
/etc/ssl/huis/speech-to-text.huis.key
```

The certificate must cover `speech-to-text.huis`. Renew the existing Huis CA
certificate with:

```bash
sudo /opt/speech-to-text/scripts/renew-huis-cert.sh
```

The renewal helper reissues the certificate, restores file permissions, and
reloads nginx. Run `sudo nginx -t` before renewal and inspect the script before
adapting it to a different certificate layout.

## Create the First Managed Client Token

Open:

```text
https://speech-to-text.huis/admin
```

Enter `ADMIN_API_TOKEN`, create a labeled client token, and store the returned
plaintext value immediately in the client's secret store. Only its hash remains
in `CLIENT_KEYS_FILE`.

Until either a bootstrap environment token or an active managed key exists,
`/readyz` correctly returns `503 missing_client_keys`. The admin API remains
available so the first managed key can be created.

## Verify the Deployment

```bash
curl -fsS https://speech-to-text.huis/healthz
curl -fsS https://speech-to-text.huis/readyz
sudo systemctl is-active speech-to-text nginx
sudo journalctl -u speech-to-text -n 50 --no-pager
```

The ready response should report `ok: true`, provider `openai`, and the expected
model. Then perform the authenticated smoke test in
[operations.md](operations.md).

## Updating an Existing Installation

Repository edits do not update installed systemd or nginx definitions. After a
reviewed code change:

```bash
cd /opt/speech-to-text
npm ci
npm run validate
sudo cp deploy/systemd/speech-to-text.service \
  /etc/systemd/system/speech-to-text.service
sudo cp deploy/nginx/speech-to-text.conf \
  /etc/nginx/sites-available/speech-to-text
sudo systemctl daemon-reload
sudo nginx -t
sudo systemctl restart speech-to-text
sudo systemctl reload nginx
curl -fsS https://speech-to-text.huis/readyz
```

When both application behavior and the proxy definition change, deploy and
verify them together so their size and timeout limits remain aligned.
