# Speech-to-Text Local API

Deployment target: `speech-to-text.huis` on the trusted Huis LAN. The repository
rollout target is TalkToMe `0.0.93`; use `npm run rollout:status` to verify live
service and extension-feed state.

This Node.js service accepts an authenticated audio upload, sends it to the
server-configured transcription provider, and returns transcript JSON. TalkToMe
and other clients continue to own microphone capture, UI state, clipboard,
paste, and submit behavior.

## Architecture

```text
TalkToMe or another LAN client
  -> HTTPS nginx on speech-to-text.huis:443
  -> Fastify on 127.0.0.1:7077
  -> OpenAI /v1/audio/transcriptions
```

The service also provides public LAN discovery and health routes plus a
separately authenticated admin API and browser UI. It is not intended for
public-internet exposure.

The service owns:

- bearer-token authentication for transcription clients;
- multipart, MIME-type, file-size, and field validation;
- the OpenAI request and timeout boundary;
- stable success and error response shapes;
- client-token lifecycle management;
- metadata-only operational logging by default.

## API Summary

- `POST /v1/transcriptions` transcribes one authenticated audio file.
- `GET /healthz` reports process liveness.
- `GET /readyz` validates required local configuration without calling OpenAI.
- `GET /llms.txt`, `GET /llms-full.txt`, and `GET /openapi.json` provide public
  LAN discovery.
- `GET /admin` serves the operator UI.
- `/admin/api/*` provides separately authenticated status, client-key, and log
  operations.

The default audio-file limit is 25 MiB (`26214400` bytes). nginx allows a 26 MiB
request body so normal multipart framing fits around a maximum-size file.

See [the API contract](docs/api-contract.md) for request and response details.

## Repository Layout

```text
deploy/                 nginx and systemd definitions
docs/                   API, deployment, operations, and rollout guides
scripts/                validation, certificate, log, and rollout helpers
src/
  admin/                admin UI, API routes, and sanitized journal reader
  auth/clientKeys.js    hashed client-token store and verification
  discovery/            llms.txt and OpenAPI documents
  transcribers/openai.js
  config.js
  errors.js
  server.js
test/                   route, key-store, config, discovery, and provider tests
```

## Requirements and Local Validation

Use Node.js 20 or newer. The full validation gate also expects ShellCheck,
nginx, and `systemd-analyze` on the host. Install the locked dependency set and
run:

```bash
npm ci
npm run validate
```

For local development, copy the non-secret template, fill the required secrets
and at least one client-token source, then explicitly point the process at it:

```bash
cp .env.example .env
ENV_FILE=.env npm start
```

`.env` files are ignored by Git. The deployed service reads
`/etc/speech-to-text/speech-to-text.env` through systemd instead.

For non-root local admin-key testing, change `CLIENT_KEYS_FILE` in `.env` to a
writable ignored path such as `./tmp/client-keys.json`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Fastify listen address; keep loopback when using nginx. |
| `PORT` | `7077` | Fastify listen port. |
| `OPENAI_API_KEY` | none | Required provider credential. |
| `TRANSCRIPTION_MODEL` | `gpt-4o-transcribe` | Server-controlled model. |
| `SPEECH_TO_TEXT_API_KEYS` | none | Optional comma-separated bootstrap/test client tokens. |
| `CLIENT_KEYS_FILE` | `/var/lib/speech-to-text/client-keys.json` | Managed hashed client-token store. |
| `ADMIN_API_TOKEN` | none | Required admin API credential. |
| `MAX_AUDIO_BYTES` | `26214400` | Maximum audio-file size in bytes. |
| `REQUEST_TIMEOUT_MS` | `120000` | Provider request timeout. |
| `LOG_TRANSCRIPTS` | `false` | Explicit opt-in for transcript text in service logs. |

`PORT`, `MAX_AUDIO_BYTES`, and `REQUEST_TIMEOUT_MS` must be complete decimal
integers; values with unit suffixes are rejected.

Readiness requires:

- `OPENAI_API_KEY`;
- at least one client token from `SPEECH_TO_TEXT_API_KEYS` or one active,
  valid record in `CLIENT_KEYS_FILE`;
- `ADMIN_API_TOKEN`.

The managed key store contains token hashes, labels, timestamps, notes, and
revocation state. Plaintext generated tokens are returned only once. Successful
authentication updates `last_used_at` in memory and batches that metadata write
in the background. A metadata-write failure is logged but does not reject an
otherwise valid transcription. Create and revoke operations wait for successful
key-store persistence.

The service loads the managed key store once per process. Use the admin API for
normal changes; restart the service after restoring or replacing the file
outside the application.

## Security and Logging

- Client tokens, the admin token, and the OpenAI key are separate credentials.
- Only token hashes are stored in the managed key file.
- nginx terminates HTTPS; Fastify trusts forwarded addresses only from loopback
  nginx connections.
- Authorization headers are redacted from Fastify logs.
- Raw audio is never logged.
- Transcript text is omitted unless `LOG_TRANSCRIPTS=true` is deliberately set.
- The admin log API returns an allowlisted, sanitized subset of journal fields.

Keep runtime secrets outside Git. The production environment file should be
readable only by root and the `speech-to-text` service group.

## TalkToMe

The repository configures TalkToMe for the local service with:

- `talkToMe.transcriptionProvider: localApi`;
- `talkToMe.transcriptionEndpoint` set to the HTTPS transcription route;
- an optional per-client `talkToMe.transcriptionCaFile` when the operating
  system does not trust the Huis root CA;
- `TalkToMe: Set Local Transcription API Key` for VS Code SecretStorage.

TalkToMe must send a speech-to-text client token, never the OpenAI or admin
credential. See [the TalkToMe rollout guide](docs/talktome-rollout.md).

## Administration and Operations

The browser UI is available at:

```text
https://speech-to-text.huis/admin
```

Admin API calls require `Authorization: Bearer <ADMIN_API_TOKEN>`. The UI can
create, list, and revoke managed client tokens and display sanitized recent
client audit events.

Use these guides for the remaining lifecycle:

- [Deployment](docs/deployment.md)
- [Operations and recovery](docs/operations.md)
- [Implementation notes](docs/implementation-plan.md)
- [Project and rollout tracker](docs/todo.md)

Repository changes do not update the running system automatically. Copy changed
deployment definitions and restart or reload the relevant service as described
in the deployment guide.
