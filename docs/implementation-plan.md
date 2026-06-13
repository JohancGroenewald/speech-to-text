# Implementation Plan

## Current TalkToMe Boundary

The model communication code currently lives in:

```text
TalkToMe/src/transcription/openaiTranscriber.js
```

The extension prepares audio and calls that module from:

```text
TalkToMe/src/extension.js
```

Current flow:

1. Recorder returns an audio buffer and MIME type.
2. TalkToMe rejects audio larger than 25 MB.
3. TalkToMe loads an OpenAI key from SecretStorage, environment, or `.env`.
4. TalkToMe creates a multipart request for `/v1/audio/transcriptions`.
5. OpenAI returns JSON with `text`.
6. TalkToMe appends the text to current transcript state, copies it, and starts the paste flow.

The standalone API should extract steps 3-5 into a server process. TalkToMe should keep steps 1-2 and 6.

## Recommended Service Implementation

Use:

```text
Node.js 20+
Fastify
@fastify/multipart
node:test
```

Core modules:

```text
src/config.js
  Reads env, validates required settings, exports normalized config.

src/transcribers/openai.js
  Contains the provider call currently represented by TalkToMe's openaiTranscriber.js.

src/server.js
  Owns HTTP routes, auth, validation, request IDs, logging, and error mapping.

src/auth/clientKeys.js
  Owns client bearer-token verification plus hashed generated token storage.

src/errors.js
  Defines stable API errors and status-code mappings.
```

## Provider Call Rules

Keep these rules from TalkToMe:

- model default: `gpt-4o-transcribe`
- response format: `json`
- optional `language` field
- request timeout: 120 seconds
- reject empty transcript responses
- do not log the provider API key

Add these server-side rules:

- reject unauthenticated requests before reading large bodies where possible;
- reject audio over `MAX_AUDIO_BYTES`;
- reject unsupported MIME types;
- include a request ID in every response;
- map provider failures into stable API error codes.

## TalkToMe Changes Later

Add a service client beside the existing OpenAI transcriber:

```text
TalkToMe/src/transcription/localApiTranscriber.js
```

Then change `transcribeAudioBuffer` to select the implementation:

```text
provider=openai    -> current direct OpenAI path
provider=localApi  -> POST audio to the LAN service
```

The extension should not send its OpenAI key to the service. It should only send the LAN service client token.

## Security Posture

First deployment can bind to LAN, but still require a bearer token. Do not expose this service directly to the public internet.

Recommended defaults:

- listen on `0.0.0.0:7077` only on the trusted network;
- firewall to local subnet if possible;
- rotate `SPEECH_TO_TEXT_API_KEYS` by allowing multiple comma-separated tokens;
- log request metadata, not audio contents;
- keep transcript logging off by default.

## Systemd Sketch

```ini
[Unit]
Description=Speech-to-Text LAN API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/speech-to-text
EnvironmentFile=/etc/speech-to-text/speech-to-text.env
ExecStart=/usr/bin/node /opt/speech-to-text/src/server.js
Restart=on-failure
RestartSec=3
User=speech-to-text
Group=speech-to-text
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

## Test Strategy

Before wiring TalkToMe to it:

1. Unit-test auth, size limits, MIME validation, and error mapping.
2. Mock the OpenAI provider in route tests.
3. Add one manual curl test using a tiny WAV file.
4. Verify `journalctl -u speech-to-text` shows request IDs without secrets.
5. Verify TalkToMe still skips transcription locally when `speechSeen === false`.

## Open Questions

- Should the service allow only TalkToMe clients, or should we support a general client contract from day one?
- Do we want transcript text in logs during early development, or keep it disabled from the start?
- Should `speech-to-text.huis` eventually sit behind HTTPS on the LAN, or is HTTP plus bearer token acceptable for the trusted subnet?
- Do we want provider selection now, or only OpenAI until there is a real second provider?
