# Implementation Notes

Status: implemented architecture. This document records the current service
boundary and the design decisions that should remain true during future work.

## Service Boundary

TalkToMe and other clients own:

- microphone capture and local no-speech detection;
- local audio-size checks for early feedback;
- UI and transcript state;
- clipboard, paste, and submit behavior;
- storage of the speech-to-text client token.

The service owns:

- client authentication;
- request and audio validation;
- provider credentials, request construction, and timeout handling;
- stable API responses and request IDs;
- managed client-token lifecycle;
- operational metadata logging.

The client sends its speech-to-text token to the local service. It never sends
an OpenAI credential or the admin token.

## Request Flow

1. nginx accepts HTTPS on `speech-to-text.huis` and proxies to loopback Fastify.
2. Fastify authenticates the client before consuming the multipart file.
3. The server accepts one supported audio file and an optional language hint.
4. The server enforces the 25 MiB file limit and rejects unknown fields.
5. The OpenAI adapter sends the configured model, JSON response format,
   language hint when present, and the audio file.
6. The adapter trims transcript text and maps timeout, provider, and empty-text
   failures to stable API errors.
7. The server returns transcript text and request metadata without persisting
   transcript history.

## Runtime Stack

```text
Node.js 20+
Fastify 5
@fastify/multipart 10
CommonJS
node:test
nginx
systemd
```

The service uses Node's built-in `fetch`, `FormData`, `Blob`, abort signals, and
cryptography APIs; it does not use an OpenAI SDK.

## Module Responsibilities

```text
src/server.js
  Fastify construction, routes, proxy trust, multipart parsing, logging,
  authentication hook, response shaping, and error normalization.

src/config.js
  Environment-file loading, strict configuration parsing, defaults, and
  readiness evaluation.

src/transcribers/openai.js
  Provider multipart request, timeout, response parsing, and provider errors.

src/auth/clientKeys.js
  Environment-token verification, managed hashed-key storage, serialized
  mutations, last-used batching, and key-store validation.

src/admin/
  Admin UI and API, journal access, and allowlisted log sanitization.

src/discovery/
  Public llms.txt guidance and OpenAPI contract.

src/errors.js
  Stable API error types, HTTP status codes, and public messages.
```

## Client-Key Design

Managed client tokens are high-entropy random values with an `stt_` prefix.
Only a SHA-256 hash is stored. The JSON record also contains an opaque ID,
operator label, optional notes, creation time, last-used time, and revocation
time.

The service loads and validates the store once per process. Admin create and
revoke operations are serialized, write a temporary mode-0600 file, atomically
rename it into place, and complete only after persistence succeeds.

Successful authentication updates `last_used_at` in memory and coalesces
background persistence. Authentication does not depend on that diagnostic
metadata write succeeding. Fastify's orderly close path asks the manager to
flush pending usage updates; an abrupt process exit can lose only recent
last-used metadata. External restore or replacement requires a service restart.

Environment tokens remain supported for bootstrap and tests. They are hashed in
memory, labeled `env-N`, and cannot be revoked through the admin API.

## Readiness Design

Readiness is local and side-effect free with respect to OpenAI. It requires:

- a non-empty provider credential;
- a non-empty admin credential;
- at least one environment client token, or a readable and structurally valid
  managed store with an active key.

This catches missing or corrupt local configuration without making every probe
consume provider capacity. A successful readiness response does not guarantee
provider reachability or credential acceptance.

## Upload and Proxy Rules

Fastify limits the audio file to `MAX_AUDIO_BYTES`, which defaults to 25 MiB.
nginx permits a 26 MiB total request so multipart headers and boundaries fit
around a maximum-size file. Multipart file-count, field-count, and schema
violations are `400 invalid_request`; only an oversized audio file is
`413 audio_too_large`.

Fastify binds to loopback in production and trusts forwarded addresses only
from `127.0.0.1` or `::1`. This records the LAN client address supplied by nginx
without accepting spoofed forwarding headers from a direct non-loopback peer.

## Logging and Privacy

The default logger redacts the authorization header. Audit events contain only
operational metadata. Raw audio is never logged. Transcript logging requires an
explicit `LOG_TRANSCRIPTS=true`; the admin journal reader still excludes
transcript events and text.

Provider error text may be returned to the authenticated caller as
`provider_error`. Callers and operators should still treat all error responses
and request IDs as potentially sensitive operational data.

## Validation Strategy

The test suite covers:

- strict configuration parsing and readiness key-store validation;
- environment and managed client-token flows;
- non-blocking failure of last-used metadata persistence;
- route authentication, multipart parsing, MIME and size validation;
- correct multipart limit error classification;
- forwarded client addresses and untrusted-header rejection;
- direct OpenAI request construction, extensions, errors, empty responses,
  network failures, and timeouts;
- admin key-management and sanitized log APIs;
- public discovery documents and the OpenAPI route.

`npm run validate` also runs JavaScript, Markdown, JSON, shell, deployment-config,
syntax, and source-length checks. It is the required local gate before a service
restart or commit.

## Deferred Scope

- streaming transcription;
- speaker diarization;
- transcript history storage;
- public-internet exposure;
- multiple transcription providers;
- per-client rate limiting.

These additions require explicit API and privacy decisions rather than being
implicit extensions of the current v1 contract.
