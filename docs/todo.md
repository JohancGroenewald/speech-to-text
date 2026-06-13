# Project TODO

Status: first implementation checklist.
Last updated: 2026-06-13.

This is the working list for getting `speech-to-text.huis` from design proposal to a running LAN service with a small management frontend.

## 0. Bootstrap Baseline

- [x] Install Node.js, npm, corepack, uv, git, build tools, nginx, jq, and step CLI.
- [x] Trust the Huis root CA on `speech-to-text.huis`.
- [x] Confirm `caserver.huis` and step-ca are reachable.
- [x] Initialize Git repository and push initial documentation to GitHub.
- [x] Store the early OpenAI test key outside the repository in `/opt/.env`.
- [ ] Move runtime secrets from `/opt/.env` to `/etc/speech-to-text/speech-to-text.env`.
- [ ] Create a dedicated `speech-to-text` Linux user and group.
- [ ] Create service directories with correct ownership and permissions:
  - `/etc/speech-to-text`
  - `/var/lib/speech-to-text`
  - `/var/log/speech-to-text` if file logging is added

## 1. Service Scaffold

- [ ] Create `package.json` with scripts for `start`, `dev`, `test`, and `lint`.
- [ ] Add `.env.example` with non-secret defaults.
- [ ] Add the planned source layout:
  - `src/server.js`
  - `src/config.js`
  - `src/transcribers/openai.js`
  - `src/auth/clientKeys.js`
  - `src/errors.js`
- [ ] Add `test/` with Node's built-in test runner.
- [ ] Decide whether to use CommonJS or ESM before writing implementation code.
- [ ] Pin the first dependency set:
  - `fastify`
  - `@fastify/multipart`
  - likely `pino-pretty` for development logs only

## 2. Configuration

- [ ] Parse and validate environment variables in `src/config.js`.
- [ ] Required config:
  - `OPENAI_API_KEY`
  - `SPEECH_TO_TEXT_API_KEYS` or a client key store path
- [ ] Defaults:
  - `HOST=127.0.0.1` when behind nginx, or `0.0.0.0` for direct LAN testing
  - `PORT=7077`
  - `TRANSCRIPTION_MODEL=gpt-4o-transcribe`
  - `MAX_AUDIO_BYTES=26214400`
  - `REQUEST_TIMEOUT_MS=120000`
  - `LOG_TRANSCRIPTS=false`
- [ ] Make `/readyz` fail clearly when required provider config is missing.
- [ ] Ensure logs never print `OPENAI_API_KEY`, client tokens, raw audio, or transcript text by default.

## 3. Transcription API

- [ ] Implement `GET /healthz`.
- [ ] Implement `GET /readyz`.
- [ ] Implement `POST /v1/transcriptions`.
- [ ] Reject unauthenticated transcription requests before reading large request bodies where Fastify allows it.
- [ ] Accept multipart field `file`.
- [ ] Accept optional `language`.
- [ ] Keep `model` server-controlled for v1 unless an explicit allowlist is added.
- [ ] Enforce maximum audio size.
- [ ] Validate supported audio MIME types and include OpenAI-compatible aliases:
  - `audio/wav`
  - `audio/webm`
  - `audio/mp4`
  - `audio/mpeg`
  - `audio/mp3`
  - `audio/m4a`
  - `audio/mpga`
- [ ] Forward audio to OpenAI `/v1/audio/transcriptions`.
- [ ] Send `response_format=json`.
- [ ] Return stable JSON responses with `request_id`.
- [ ] Map provider errors to documented API error codes.
- [ ] Reject empty transcript responses with `422 empty_transcript`.

## 4. Client API Keys

- [ ] Choose the first key-storage design before building the frontend.
- [ ] Minimum viable option: `SPEECH_TO_TEXT_API_KEYS` in the systemd environment file.
- [ ] Better management option: root-owned JSON key store with hashed tokens, labels, creation dates, and revoked state.
- [ ] If using a key store, add config such as `CLIENT_KEYS_FILE=/etc/speech-to-text/client-keys.json`.
- [ ] Generate high-entropy client tokens.
- [ ] Display full client tokens only once at creation time.
- [ ] Store only hashed client tokens if the management frontend will support revoke/list flows.
- [ ] Support labels such as `talktome-johan-laptop` or `talktome-desktop`.
- [ ] Add key verification tests for valid, invalid, missing, and revoked tokens.
- [ ] Document key rotation steps.

## 5. Management Frontend

- [ ] Decide whether the frontend is:
  - server-rendered by Fastify, or
  - static assets served by nginx with admin API calls to Fastify.
- [ ] Keep the first UI small and operational, not marketing-like.
- [ ] First screen should show service status, readiness, configured model, and key-management actions.
- [ ] Add client key creation form:
  - label
  - optional notes
  - create token
  - one-time copyable token display
- [ ] Add client key list:
  - label
  - created date
  - last-used date if tracked
  - revoked state
  - revoke action
- [ ] Add a simple diagnostics panel:
  - Node version
  - service version or Git SHA
  - provider model
  - max upload size
  - request timeout
- [ ] Protect the admin UI separately from transcription clients.
- [ ] Pick initial admin protection:
  - LAN-only plus nginx basic auth, or
  - `ADMIN_API_TOKEN` bearer auth, or
  - both
- [ ] Ensure the frontend never exposes the OpenAI API key.
- [ ] Add frontend tests or route tests for key-management flows.

## 6. HTTPS and nginx

- [ ] Obtain or issue a TLS certificate for `speech-to-text.huis` from the Huis CA.
- [ ] Store nginx certificate material outside the repository.
- [ ] Replace the default nginx site with a `speech-to-text.huis` server block.
- [ ] Proxy API traffic to the Node service:
  - `/v1/transcriptions`
  - `/healthz`
  - `/readyz`
  - admin frontend routes
- [ ] Set upload limits in nginx to match `MAX_AUDIO_BYTES`.
- [ ] Set proxy timeouts above `REQUEST_TIMEOUT_MS`.
- [ ] Verify `https://speech-to-text.huis` works from the LAN with the Huis root CA installed.
- [ ] Decide whether direct `http://speech-to-text.huis:7077` remains available during testing only.

## 7. systemd Deployment

- [ ] Add `/etc/systemd/system/speech-to-text.service`.
- [ ] Run as `speech-to-text`, not root.
- [ ] Use `EnvironmentFile=/etc/speech-to-text/speech-to-text.env`.
- [ ] Set `WorkingDirectory=/opt/speech-to-text`.
- [ ] Use `ExecStart=/usr/local/bin/node /opt/speech-to-text/src/server.js`.
- [ ] Add hardening options:
  - `NoNewPrivileges=true`
  - `PrivateTmp=true`
  - `ProtectSystem=strict` if compatible
  - `ReadWritePaths=/var/lib/speech-to-text /etc/speech-to-text` if a key store is used
- [ ] Enable and start the service.
- [ ] Verify restart behavior and logs through `journalctl -u speech-to-text`.

## 8. Test Plan

- [ ] Unit-test config parsing and validation.
- [ ] Unit-test auth and client key lookup.
- [ ] Route-test health and readiness.
- [ ] Route-test missing file, bad MIME type, oversize file, and bad multipart requests.
- [ ] Mock OpenAI provider success and error responses.
- [ ] Verify request IDs appear in success and error responses.
- [ ] Add one manual curl test with a tiny WAV file.
- [ ] Add one manual TalkToMe end-to-end test after the extension integration exists.
- [ ] Confirm logs contain request metadata but not transcript text or secrets.

## 9. TalkToMe Integration

- [ ] Add `TalkToMe/src/transcription/localApiTranscriber.js`.
- [ ] Add settings:
  - `talkToMe.transcriptionProvider`
  - `talkToMe.transcriptionEndpoint`
  - `talkToMe.transcriptionApiKey`
- [ ] Store the local API key in VS Code SecretStorage.
- [ ] Keep direct OpenAI transcription as a fallback while proving the service.
- [ ] Preserve current TalkToMe behavior for:
  - local audio size rejection
  - language hint
  - transcript append
  - clipboard copy
  - paste and submit workflow
  - no-speech skip behavior
- [ ] Add extension tests around provider selection and local API errors.
- [ ] Package a new TalkToMe `.vsix` for one-machine rollout.

## 10. Operational Docs

- [ ] Document first-time setup.
- [ ] Document service start, stop, restart, and log inspection.
- [ ] Document how to create, revoke, and rotate client keys.
- [ ] Document how to renew or replace the TLS certificate.
- [ ] Document how to update Node dependencies.
- [ ] Document manual recovery if the admin UI is unavailable.
- [ ] Document backup needs for any client key store.

## 11. Rollout

- [ ] Deploy service manually on `speech-to-text.huis`.
- [ ] Confirm local curl transcription works.
- [ ] Enable nginx HTTPS route.
- [ ] Create one TalkToMe client token.
- [ ] Switch one machine to `localApi`.
- [ ] Monitor logs and latency.
- [ ] Broaden to additional clients after one stable day of use.

