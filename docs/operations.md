# Operations

Day-to-day operation and recovery for `speech-to-text.huis`.

## Service Control

```bash
sudo systemctl status speech-to-text
sudo systemctl restart speech-to-text
sudo journalctl -u speech-to-text -f
```

Fastify listens on `127.0.0.1:7077`. LAN clients must use nginx over HTTPS:

```text
https://speech-to-text.huis
```

## Health and Readiness

```bash
curl -fsS https://speech-to-text.huis/healthz
curl -fsS https://speech-to-text.huis/readyz
```

`/healthz` confirms only that the HTTP process is alive. `/readyz` verifies the
provider key, at least one active client credential, the managed key-store
format when it is needed, and the admin token. It does not call OpenAI.

Common readiness failures:

| Code | Operator action |
| --- | --- |
| `missing_provider_key` | Set `OPENAI_API_KEY` in the systemd environment file. |
| `missing_client_keys` | Create a managed key or configure a bootstrap client token. |
| `invalid_client_keys` | Check key-store JSON, ownership, permissions, and restore from backup if needed. |
| `missing_admin_token` | Set a separate high-entropy `ADMIN_API_TOKEN`. |

Restart the service after editing its environment file or externally restoring
the managed key store.

## Admin Access

The admin UI is available at:

```text
https://speech-to-text.huis/admin
```

The runtime admin credential is `ADMIN_API_TOKEN` in:

```text
/etc/speech-to-text/speech-to-text.env
```

An operator handoff copy may be kept in
`/root/speech-to-text-admin-token.txt` on the current host. Treat any such copy
as a root-only secret. Never paste tokens into Git, documentation, recorded
shell command lines, or chat logs.

The browser keeps the entered admin token in `sessionStorage`, so closing the
tab or browser session removes it. Admin API calls use the token as a bearer
credential.

## Client Keys

Create, list, and revoke managed client keys from the admin UI. Generated
plaintext tokens are shown once; the service-owned store contains only hashes
and metadata:

```text
/var/lib/speech-to-text/client-keys.json
```

Successful file-token authentication updates `last_used_at` immediately in
memory and batches the file write in the background. If that metadata write
fails, authentication still succeeds and the service logs:

```text
client key usage metadata could not be persisted
```

Create and revoke operations are serialized and return success only after the
updated store has been written durably. The store is loaded once per process;
restart after replacing it outside the admin API.

Rotate a managed client token:

1. Create a labeled replacement token in the admin UI.
2. Put it in the client secret store, such as TalkToMe SecretStorage.
3. Confirm a transcription succeeds with the replacement.
4. Revoke the old managed key.

Environment-sourced client tokens appear in the key list but cannot be revoked
through the admin API. Remove them from `SPEECH_TO_TEXT_API_KEYS` and restart the
service.

## Manual Transcription Smoke Test

Generate a small local WAV and send it through the HTTPS API. Read the token
without printing it:

```bash
stt_smoke_dir="$(mktemp -d)"
trap 'rm -rf "$stt_smoke_dir"' EXIT
espeak-ng -w "$stt_smoke_dir/smoke.wav" "testing speech to text service"
stt_client_token="$(sudo sed -n '1p' /root/speech-to-text-initial-client-token.txt)"
curl -fsS \
  --config - \
  -F "file=@$stt_smoke_dir/smoke.wav;type=audio/wav" \
  -F "language=en" \
  https://speech-to-text.huis/v1/transcriptions \
  <<< "header = \"Authorization: Bearer $stt_client_token\""
unset stt_client_token
```

If the legacy initial-token handoff file is no longer retained, use a currently
active client token through an equally protected input method. The response
should contain transcript text, a request ID, provider `openai`, and the
configured model.

## Logs and Diagnostics

Watch sanitized transcription audit events:

```bash
sudo /opt/speech-to-text/scripts/watch-transcriptions.sh "10 minutes ago"
```

The normal event sequence is:

```text
client request received
client audio received
transcription complete
client response sent
```

A failed request also produces `request failed`. Events include request and
client IDs, sizes, MIME type, language hint, status, latency, provider, model,
and transcript character count as applicable.

Authorization headers and raw audio are never logged. Transcript text is
omitted by default. Enable `LOG_TRANSCRIPTS=true` only for a deliberate,
short-lived diagnostic window, then restart the service; disable it and restart
again immediately afterward. The admin log API always filters transcript text
out of its response.

Run the one-shot rollout check with:

```bash
cd /opt/speech-to-text
npm run rollout:status -- "10 minutes ago"
```

It checks service health and readiness, model, nginx and systemd state,
workspace TalkToMe configuration, the configured extension-feed target, and a
safe summary of recent completion events.

## Deploy Repository Changes

The repository is not an automatic deployment mechanism. After reviewed
changes, follow [deployment.md](deployment.md). At minimum, validate before
restarting:

```bash
cd /opt/speech-to-text
npm ci
npm run validate
sudo systemctl restart speech-to-text
```

If `deploy/nginx/speech-to-text.conf` changed, install it, run `sudo nginx -t`,
and reload nginx. If the systemd unit changed, copy it and run
`sudo systemctl daemon-reload` before restarting.

## TLS Renewal

```bash
sudo nginx -t
sudo /opt/speech-to-text/scripts/renew-huis-cert.sh
curl -fsSI https://speech-to-text.huis/admin
```

The renewal script reissues the certificate, restores certificate and key
permissions, and reloads nginx.

## Dependency Updates

Review available updates before changing the lockfile:

```bash
cd /opt/speech-to-text
npm outdated
npm update
npm run validate
```

Review and commit both manifest and lockfile changes intentionally. Restart the
service only after validation passes.

## Local Validation

```bash
npm run validate
```

The gate runs JavaScript and Markdown linting, JSON parsing, ShellCheck,
deployment-config checks, source-file length limits, JavaScript syntax checks,
and the complete Node test suite.

Enable the same pre-commit gate for this checkout with:

```bash
git config core.hooksPath .githooks
```

## Troubleshooting and Recovery

Inspect service and nginx failures without exposing environment contents:

```bash
sudo journalctl -u speech-to-text -n 100 --no-pager
sudo nginx -t
sudo journalctl -u nginx -n 100 --no-pager
```

For `invalid_client_keys`, first preserve the damaged file and its permissions,
then restore a known-good encrypted backup. Restart because the service caches
the store in memory. If no backup is available, move the damaged file to a
root-only recovery location, restart, and create replacement client tokens
through the admin UI. Existing managed client tokens will no longer work.

If usage metadata cannot be persisted but transcription still works, verify
that `/var/lib/speech-to-text` and `client-keys.json` are writable by the
`speech-to-text` service account and that the filesystem has free space.

## Backups

Back up:

```text
/etc/speech-to-text/speech-to-text.env
/var/lib/speech-to-text/client-keys.json
/etc/ssl/huis/speech-to-text.huis.crt
/etc/ssl/huis/speech-to-text.huis.key
```

Keep backups encrypted and access-controlled. The environment file contains
plaintext credentials, and the key store contains authentication hashes and
client metadata.
