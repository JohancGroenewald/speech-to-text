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
- [x] Move runtime secrets from `/opt/.env` to `/etc/speech-to-text/speech-to-text.env`.
- [x] Create a dedicated `speech-to-text` Linux user and group.
- [x] Create service directories with correct ownership and permissions:
  - `/etc/speech-to-text`
  - `/var/lib/speech-to-text`
  - `/var/log/speech-to-text` if file logging is added

## 1. Service Scaffold

- [x] Create `package.json` with scripts for `start`, `dev`, `test`, and `lint`.
- [x] Add `.env.example` with non-secret defaults.
- [x] Add the planned source layout:
  - `src/server.js`
  - `src/config.js`
  - `src/transcribers/openai.js`
  - `src/auth/clientKeys.js`
  - `src/errors.js`
- [x] Add `test/` with Node's built-in test runner.
- [x] Decide whether to use CommonJS or ESM before writing implementation code.
- [x] Pin the first dependency set:
  - `fastify`
  - `@fastify/multipart`

## 2. Configuration

- [x] Parse and validate environment variables in `src/config.js`.
- [x] Required config:
  - `OPENAI_API_KEY`
  - `SPEECH_TO_TEXT_API_KEYS` or a client key store path
- [x] Defaults:
  - `HOST=127.0.0.1` when behind nginx, or `0.0.0.0` for direct LAN testing
  - `PORT=7077`
  - `TRANSCRIPTION_MODEL=gpt-4o-transcribe`
  - `MAX_AUDIO_BYTES=26214400`
  - `REQUEST_TIMEOUT_MS=120000`
  - `LOG_TRANSCRIPTS=false`
- [x] Make `/readyz` fail clearly when required provider config is missing.
- [x] Ensure logs never print `OPENAI_API_KEY`, client tokens, raw audio, or transcript text by default.

## 3. Transcription API

- [x] Implement `GET /healthz`.
- [x] Implement `GET /readyz`.
- [x] Implement `POST /v1/transcriptions`.
- [x] Reject unauthenticated transcription requests before reading large request bodies where Fastify allows it.
- [x] Accept multipart field `file`.
- [x] Accept optional `language`.
- [x] Keep `model` server-controlled for v1 unless an explicit allowlist is added.
- [x] Enforce maximum audio size.
- [x] Validate supported audio MIME types and include OpenAI-compatible aliases:
  - `audio/wav`
  - `audio/webm`
  - `audio/mp4`
  - `audio/mpeg`
  - `audio/mp3`
  - `audio/m4a`
  - `audio/mpga`
- [x] Forward audio to OpenAI `/v1/audio/transcriptions`.
- [x] Send `response_format=json`.
- [x] Return stable JSON responses with `request_id`.
- [x] Map provider errors to documented API error codes.
- [x] Reject empty transcript responses with `422 empty_transcript`.

## 4. Client API Keys

- [x] Choose the first key-storage design before building the frontend.
- [x] Supersede the minimum viable `SPEECH_TO_TEXT_API_KEYS` option with the hashed key store while keeping env-token support for tests/bootstrap.
- [x] Better management option: root-owned JSON key store with hashed tokens, labels, creation dates, and revoked state.
- [x] If using a key store, add config such as `CLIENT_KEYS_FILE=/etc/speech-to-text/client-keys.json`.
- [x] Generate high-entropy client tokens.
- [x] Display full client tokens only once at creation time.
- [x] Store only hashed client tokens if the management frontend will support revoke/list flows.
- [x] Support labels such as `talktome-johan-laptop` or `talktome-desktop`.
- [x] Add key verification tests for valid, invalid, missing, and revoked tokens.
- [x] Document key rotation steps.

## 5. Management Frontend

- [x] Decide whether the frontend is:
  - server-rendered by Fastify
  - static assets served by nginx with admin API calls to Fastify.
- [x] Keep the first UI small and operational, not marketing-like.
- [x] First screen should show service status, readiness, configured model, and key-management actions.
- [x] Add client key creation form:
  - label
  - optional notes
  - create token
  - one-time copyable token display
- [x] Add client key list:
  - label
  - created date
  - last-used date if tracked
  - revoked state
  - revoke action
- [x] Add a simple diagnostics panel:
  - Node version
  - service version or Git SHA
  - provider model
  - max upload size
  - request timeout
- [x] Protect the admin UI separately from transcription clients.
- [x] Pick initial admin protection:
  - LAN-only plus nginx basic auth, or
  - `ADMIN_API_TOKEN` bearer auth
  - both
- [x] Ensure the frontend never exposes the OpenAI API key.
- [x] Add frontend tests or route tests for key-management flows.

## 6. HTTPS and nginx

- [x] Obtain or issue a TLS certificate for `speech-to-text.huis` from the Huis CA.
- [x] Store nginx certificate material outside the repository.
- [x] Replace the default nginx site with a `speech-to-text.huis` server block.
- [x] Proxy API traffic to the Node service:
  - `/v1/transcriptions`
  - `/healthz`
  - `/readyz`
  - admin frontend routes
- [x] Set upload limits in nginx to match `MAX_AUDIO_BYTES`.
- [x] Set proxy timeouts above `REQUEST_TIMEOUT_MS`.
- [x] Verify `https://speech-to-text.huis` works from the LAN with the Huis root CA installed.
- [x] Decide whether direct `http://speech-to-text.huis:7077` remains available during testing only.

## 7. systemd Deployment

- [x] Add `/etc/systemd/system/speech-to-text.service`.
- [x] Run as `speech-to-text`, not root.
- [x] Use `EnvironmentFile=/etc/speech-to-text/speech-to-text.env`.
- [x] Set `WorkingDirectory=/opt/speech-to-text`.
- [x] Use `ExecStart=/usr/local/bin/node /opt/speech-to-text/src/server.js`.
- [x] Add hardening options:
  - `NoNewPrivileges=true`
  - `PrivateTmp=true`
  - `ProtectSystem=strict` if compatible
  - `ReadWritePaths=/var/lib/speech-to-text /var/log/speech-to-text` if a key store is used
- [x] Enable and start the service.
- [x] Verify restart behavior and logs through `journalctl -u speech-to-text`.

## 8. Test Plan

- [x] Unit-test config parsing and validation.
- [x] Unit-test auth and client key lookup.
- [x] Route-test health and readiness.
- [x] Route-test missing file, bad MIME type, oversize file, and bad multipart requests.
- [x] Mock OpenAI provider success and error responses.
- [x] Verify request IDs appear in success and error responses.
- [x] Add one manual curl test with a tiny WAV file.
- [x] Add one manual TalkToMe local API transcriber smoke after the extension integration exists.
- [ ] Add one client-side TalkToMe UI end-to-end test after the extension is updated and its SecretStorage token is set.
- [x] Confirm logs contain request metadata but not transcript text or secrets.

## 9. Tooling and Source Hygiene

- [x] Set up linters/parsers for every source/documentation file type in the repository.
- [x] Cover JavaScript source and tests.
- [x] Cover Markdown documentation.
- [x] Cover JSON files such as `package.json` and deployment examples.
- [x] Cover nginx and systemd config files if they are stored in the repository.
- [x] Wire the checks into a Git pre-commit hook.
- [x] Add a source-file size check that fails on source files with more than 500 lines of source code.
- [x] Refactor any source files that exceed the 500-line limit.
- [x] Document how to run the full local validation suite.

## 10. TalkToMe Integration

- [x] Add `TalkToMe/src/transcription/localApiTranscriber.js`.
- [x] Add settings:
  - `talkToMe.transcriptionProvider`
  - `talkToMe.transcriptionEndpoint`
- [x] Add local API key commands:
  - `talkToMe.setTranscriptionApiKey`
  - `talkToMe.clearTranscriptionApiKey`
- [x] Store the local API key in VS Code SecretStorage.
- [x] Keep direct OpenAI transcription as a fallback while proving the service.
- [x] Preserve current TalkToMe behavior for:
  - local audio size rejection
  - language hint
  - transcript append
  - clipboard copy
  - paste and submit workflow
  - no-speech skip behavior
- [x] Add extension tests around provider selection and local API errors.
- [x] Package a new TalkToMe `.vsix` for one-machine rollout.
- [x] Publish TalkToMe `0.0.88` with private-CA support to the Huis extension feed.

## 11. Operational Docs

- [x] Document first-time setup.
- [x] Document service start, stop, restart, and log inspection.
- [x] Document how to create, revoke, and rotate client keys.
- [x] Document how to renew or replace the TLS certificate.
- [x] Document how to update Node dependencies.
- [x] Document manual recovery if the admin UI is unavailable.
- [x] Document backup needs for any client key store.

## 12. Rollout

- [x] Deploy service manually on `speech-to-text.huis`.
- [x] Confirm local curl transcription works.
- [x] Enable nginx HTTPS route.
- [x] Create one TalkToMe client token.
- [x] Run a live local API smoke from `vscode.huis` using TalkToMe's local transcriber module.
- [ ] Switch one machine to `localApi`.
- [ ] Monitor logs and latency from a client-side TalkToMe UI recording.
- [ ] Broaden to additional clients after one stable day of use.
