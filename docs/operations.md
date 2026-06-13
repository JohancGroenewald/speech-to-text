# Operations

Day-to-day commands for `speech-to-text.huis`.

## Service Control

```bash
sudo systemctl status speech-to-text
sudo systemctl restart speech-to-text
sudo journalctl -u speech-to-text -f
```

The service listens on `127.0.0.1:7077`. LAN clients should use nginx:

```text
https://speech-to-text.huis
```

## Health and Readiness

```bash
curl -fsS https://speech-to-text.huis/healthz
curl -fsS https://speech-to-text.huis/readyz
```

Expected readiness model:

```text
gpt-4o-transcribe
```

## Admin Access

The admin UI is available at:

```text
https://speech-to-text.huis/admin
```

The admin token is stored on the server at:

```text
/root/speech-to-text-admin-token.txt
```

Do not paste the admin token into Git, docs, shell history, or chat logs.

## Client Keys

Create client keys from the admin UI. Generated tokens are shown once. After creation, only the token hash is stored in:

```text
/var/lib/speech-to-text/client-keys.json
```

The initial one-time TalkToMe token generated during bootstrap is stored at:

```text
/root/speech-to-text-initial-client-token.txt
```

Rotate a client token:

1. Create a replacement token in the admin UI.
2. Update the client, such as TalkToMe SecretStorage, with the new token.
3. Confirm the client can transcribe.
4. Revoke the old token from the admin UI.

## Manual Transcription Smoke Test

Generate a local test WAV and send it through the HTTPS API:

```bash
tmpdir="$(mktemp -d)"
espeak-ng -w "$tmpdir/smoke.wav" "testing speech to text service"
token="$(sudo sed -n '1p' /root/speech-to-text-initial-client-token.txt)"
curl -fsS \
  -H "Authorization: Bearer $token" \
  -F "file=@$tmpdir/smoke.wav;type=audio/wav" \
  -F "language=en" \
  https://speech-to-text.huis/v1/transcriptions
rm -rf "$tmpdir"
```

The response should include `model: "gpt-4o-transcribe"` and a transcript.

## TLS Renewal

Renew the Huis CA certificate with:

```bash
sudo /opt/speech-to-text/scripts/renew-huis-cert.sh
```

Then verify:

```bash
curl -fsSI https://speech-to-text.huis/admin
```

## Dependency Updates

```bash
cd /opt/speech-to-text
npm outdated
npm update
npm test
npm run lint
sudo systemctl restart speech-to-text
```

Commit and push dependency lockfile changes after tests pass.

## Recovery

If nginx is unavailable, inspect its config and logs:

```bash
sudo nginx -t
sudo journalctl -u nginx -n 100 --no-pager
```

If the admin UI is unavailable but the service is running, use the root-only token files to recover access. If the key store is damaged, restore it from backup or move it aside and restart the service; then create new client tokens from the admin UI.

## Backups

Back up these files:

```text
/etc/speech-to-text/speech-to-text.env
/var/lib/speech-to-text/client-keys.json
/etc/ssl/huis/speech-to-text.huis.crt
/etc/ssl/huis/speech-to-text.huis.key
```

Keep backups encrypted or otherwise protected. They contain service secrets or credentials.
