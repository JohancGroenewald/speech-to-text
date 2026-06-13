# Speech-to-Text Local API

Status: deployed on `speech-to-text.huis` and in first-client TalkToMe rollout.

This service extracts the model communication boundary from the TalkToMe VS Code extension and exposes it as a small local-network API. TalkToMe and other LAN clients keep owning microphone capture, UI state, clipboard, paste, and submit behavior. This service owns only:

- accepting an audio file from a trusted local client;
- enforcing size, timeout, and request validation rules;
- sending the audio to the configured transcription model;
- returning the transcript as JSON.

## Why Extract This

TalkToMe can call OpenAI directly from the extension host, but the rollout path is now the local API. Centralizing that model call gives us:

- one place to store and rotate the OpenAI API key;
- one API contract for TalkToMe and future clients;
- one logging and diagnostics surface for transcription failures;
- the option to swap transcription providers later without changing every client;
- simpler client installs because desktop machines no longer need an OpenAI key.

## Recommended Shape

Use a small Node.js HTTP service on `speech-to-text.huis`.

Reasoning:

- TalkToMe is already JavaScript and its existing OpenAI transcription code can be moved with minimal behavior drift.
- Node 20+ has stable `fetch`, `FormData`, `Blob`, and `File` APIs, so the service can forward multipart audio cleanly.
- Fastify gives simple request-size limits, logging hooks, schema validation, and health routes without much ceremony.

Python/FastAPI would also work, but it would duplicate the current JavaScript transcriber and make TalkToMe/service parity more work.

## Scope Boundaries

In scope:

- `POST /v1/transcriptions`
- `GET /healthz`
- `GET /readyz`
- API-key based LAN authentication
- OpenAI `gpt-4o-transcribe` as the first provider
- request size limit aligned with OpenAI's 25 MB audio limit
- structured logs that do not include raw audio or transcript text by default

Out of scope for the first implementation:

- microphone capture on the server
- paste or keyboard automation
- transcript history storage
- speaker diarization
- streaming transcription
- public internet exposure

## Initial Directory Layout

```text
/opt/speech-to-text
  README.md
  docs/
    api-contract.md
    implementation-plan.md
    todo.md
  scripts/
    check-syntax.js
  src/
    server.js
    config.js
    errors.js
    auth/
      clientKeys.js
    transcribers/
      openai.js
  test/
    clientKeys.test.js
    server.test.js
  .env.example
  package.json
```

## Documentation

- [API contract](docs/api-contract.md)
- [Implementation plan](docs/implementation-plan.md)
- [Deployment](docs/deployment.md)
- [Operations](docs/operations.md)
- [TalkToMe rollout](docs/talktome-rollout.md)
- [Project TODO](docs/todo.md)

## Configuration

The service should read configuration from environment variables:

```text
HOST=0.0.0.0
PORT=7077
OPENAI_API_KEY=sk-...
TRANSCRIPTION_MODEL=gpt-4o-transcribe
SPEECH_TO_TEXT_API_KEYS=comma,separated,client,tokens
CLIENT_KEYS_FILE=/var/lib/speech-to-text/client-keys.json
MAX_AUDIO_BYTES=26214400
REQUEST_TIMEOUT_MS=120000
LOG_TRANSCRIPTS=false
```

Keep real secrets out of git. On the server, put runtime secrets in `/etc/speech-to-text/speech-to-text.env`, readable by root and the service group only. The deployed service uses `CLIENT_KEYS_FILE` for managed, hashed client tokens; `SPEECH_TO_TEXT_API_KEYS` is still useful for simple local tests.

## Client Integration Plan

TalkToMe 0.0.92 defaults to local transcription mode and includes private Huis CA support, a provider-aware key check for `localApi`, and safer handling for OS-specific CA file paths:

- `talkToMe.transcriptionProvider`: `openai` or `localApi`
- `talkToMe.transcriptionEndpoint`: defaults to `https://speech-to-text.huis/v1/transcriptions`
- `talkToMe.transcriptionCaFile`: optional per-client PEM path when the OS trust store does not trust the Huis root CA
- `TalkToMe: Set Local Transcription API Key`: stores the client token in VS Code SecretStorage

The extension keeps the current direct OpenAI path as the fallback while the service is proven stable.

## Management Frontend

The service includes a small operational admin UI at:

```text
https://speech-to-text.huis/admin
```

Admin API calls require `Authorization: Bearer <ADMIN_API_TOKEN>`.
The UI can create, list, and revoke client tokens. Generated client tokens are displayed once and then stored only as hashes in the configured `CLIENT_KEYS_FILE`.

## First Milestone

1. Build the Node/Fastify service with health routes and one transcription route.
2. Add mocked tests for multipart validation and OpenAI forwarding.
3. Run it manually on `speech-to-text.huis`.
4. Add a systemd unit.
5. Add TalkToMe local API support behind a setting.
6. Switch one machine over, then broaden usage.

## Rollout Status

Run the server-side rollout checks with:

```bash
npm run rollout:status
```

This verifies service health, readiness, the configured transcription model, nginx and systemd state, the workspace TalkToMe settings, the Huis extension feed version, and recent transcription completion logs without printing tokens or transcript text.

## Server Bootstrap Notes

Current host:

```text
hostname: speech-to-text
project: /opt/speech-to-text
service DNS: speech-to-text.huis
CA DNS: caserver.huis
```

Installed tooling:

```text
Node.js v26.3.0
npm 11.17.0
corepack 0.35.0
uv 0.11.21
git 2.43.0
Smallstep step CLI 0.30.6
jq 1.7
nginx 1.24.0
espeak-ng 1.51
shellcheck 0.9.0
ESLint 10.x
markdownlint-cli2 0.22.x
```

Base OS packages added for development and deployment:

```text
ca-certificates
curl
git
openssh-client
build-essential
xz-utils
gnupg
nginx
jq
step-cli
espeak-ng
shellcheck
```

Local configuration state:

- `/etc/speech-to-text/speech-to-text.env` holds runtime secrets and is mode `0640` for `root:speech-to-text`.
- `/opt/.env` was used only for early testing and has been retired.
- Client API keys are separate bearer tokens stored as hashes in `CLIENT_KEYS_FILE`; clients should not receive the OpenAI API key.

CA and HTTPS state:

- `caserver.huis` resolves and serves the Huis root CA distribution page.
- The Huis root CA has been installed into this host's Ubuntu trust store.
- `https://caserver.huis` verifies without `curl -k`.
- step-ca is reachable at `https://caserver.huis:9000`.
- step-ca health returns `{"status":"ok"}` and version returns `{"version":"0.29.0"}`.

Web front door state:

- nginx is installed, active, and enabled.
- The default nginx site currently responds on `http://speech-to-text.huis`.
- The application API should still bind locally or on the LAN as planned; nginx can later terminate HTTPS and proxy to the Node service and any management UI.

Git and GitHub state:

- The repository is initialized on branch `main`.
- GitHub remote `origin` uses SSH alias `github.com-speech-to-text`.
- Remote URL: `git@github.com-speech-to-text:JohancGroenewald/speech-to-text.git`
- The SSH private key is stored at `/root/.ssh/speech-to-text_github_ed25519`.
- The SSH public key fingerprint is `SHA256:G6wNsxsUI9JgPfqBjmSYThhdaVCAC0zi/J89tuDXGE0`.
