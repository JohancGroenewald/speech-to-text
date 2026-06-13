# Speech-to-Text Local API

Status: design proposal, ready for implementation.

This service will extract the model communication boundary from the TalkToMe VS Code extension and expose it as a small local-network API. TalkToMe and other LAN clients will keep owning microphone capture, UI state, clipboard, paste, and submit behavior. This service will own only:

- accepting an audio file from a trusted local client;
- enforcing size, timeout, and request validation rules;
- sending the audio to the configured transcription model;
- returning the transcript as JSON.

## Why Extract This

TalkToMe currently calls OpenAI directly from the extension host after recording audio. Centralizing that model call gives us:

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
- [Project TODO](docs/todo.md)

## Configuration

The service should read configuration from environment variables:

```text
HOST=0.0.0.0
PORT=7077
OPENAI_API_KEY=sk-...
TRANSCRIPTION_MODEL=gpt-4o-transcribe
SPEECH_TO_TEXT_API_KEYS=comma,separated,client,tokens
MAX_AUDIO_BYTES=26214400
REQUEST_TIMEOUT_MS=120000
LOG_TRANSCRIPTS=false
```

Keep real secrets out of git. On the server, put them in `/etc/speech-to-text/speech-to-text.env` or a systemd environment file readable only by root.

## Client Integration Plan

TalkToMe should get a new transcription mode:

- `talkToMe.transcriptionProvider`: `openai` or `localApi`
- `talkToMe.transcriptionEndpoint`: default empty, example `http://speech-to-text.huis:7077/v1/transcriptions`
- `talkToMe.transcriptionApiKey`: ideally SecretStorage, not plain settings

The extension should keep the current direct OpenAI path as a fallback until the service has been proven stable.

## First Milestone

1. Build the Node/Fastify service with health routes and one transcription route.
2. Add mocked tests for multipart validation and OpenAI forwarding.
3. Run it manually on `speech-to-text.huis`.
4. Add a systemd unit.
5. Add TalkToMe local API support behind a setting.
6. Switch one machine over, then broaden usage.

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
```

Local configuration state:

- `/opt/.env` currently holds `OPENAI_API_KEY` for early testing and is mode `0600`.
- `/opt/.env` is outside this Git repository and must not be committed.
- Future service deployment should move runtime secrets into `/etc/speech-to-text/speech-to-text.env`.
- Client API keys should be separate bearer tokens stored in `SPEECH_TO_TEXT_API_KEYS`; clients should not receive the OpenAI API key.

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
