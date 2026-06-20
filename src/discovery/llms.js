const SUPPORTED_AUDIO_TYPES = [
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mpga'
];

const BASE_URL = 'https://speech-to-text.huis';

const LLMS_TXT = `# Huis Speech-to-Text API

Base URL: ${BASE_URL}
OpenAPI schema: ${BASE_URL}/openapi.json
Full LLM guide: ${BASE_URL}/llms-full.txt

Purpose: transcribe one authenticated audio upload into text for trusted Huis LAN clients.

Primary endpoint:
- POST /v1/transcriptions
- Auth: Authorization: Bearer <client-token>
- Body: multipart/form-data
- Required field: file=<audio file>
- Optional field: language=<language hint, for example en or af>
- Do not send a model field. The model is controlled by the server.
- Success JSON: { "text": "...", "model": "gpt-4o-transcribe", "provider": "openai", "duration_ms": 842, "request_id": "req_..." }

Discovery and health:
- GET /healthz checks whether the HTTP process is alive.
- GET /readyz checks whether required provider configuration is present.
- GET /openapi.json returns the machine-readable API contract.

Safety rules for agents:
- Never log, print, or expose bearer tokens.
- Never send raw audio or transcript text to admin logs.
- Treat transcript text as user data.
- Use admin endpoints only with an admin token and only for service operation tasks.
`;

const LLMS_FULL_TXT = `# Huis Speech-to-Text API Full LLM Guide

Base URL: ${BASE_URL}
OpenAPI schema: ${BASE_URL}/openapi.json

## What this service does

This LAN service accepts one audio file from a trusted client, sends it to the server-configured transcription provider, and returns transcript JSON. Clients such as TalkToMe keep owning microphone capture, UI behavior, clipboard, paste, and submit actions.

The server controls the transcription model. Current default model: gpt-4o-transcribe.

## Authentication

Transcription clients must send:

Authorization: Bearer <client-token>

Admin APIs require:

Authorization: Bearer <ADMIN_API_TOKEN>

Never print tokens in logs, terminal output, chat responses, or transcripts. Client tokens are separate from the OpenAI API key. Clients should never receive the OpenAI API key.

## Transcribe audio

POST /v1/transcriptions

Request type: multipart/form-data

Fields:
- file: required audio file, maximum 25 MB by default
- language: optional language hint, for example en or af

Forbidden fields:
- model: forbidden in v1 because the server controls model selection

Supported audio MIME types:
${SUPPORTED_AUDIO_TYPES.map((type) => `- ${type}`).join('\n')}

Example curl:

curl -sS \\
  -H "Authorization: Bearer $SPEECH_TO_TEXT_CLIENT_KEY" \\
  -F "file=@sample.wav;type=audio/wav" \\
  -F "language=en" \\
  ${BASE_URL}/v1/transcriptions

Successful response:

{
  "text": "The transcribed text.",
  "model": "gpt-4o-transcribe",
  "provider": "openai",
  "duration_ms": 842,
  "request_id": "req_0123456789abcdef"
}

## Error shape

All API errors use this JSON envelope:

{
  "error": {
    "code": "invalid_request",
    "message": "Human-readable error.",
    "request_id": "req_0123456789abcdef"
  }
}

Important status codes:
- 400 invalid_request: malformed multipart, missing file, unsupported field, or forbidden model field
- 401 unauthorized: missing or invalid bearer token
- 413 audio_too_large: audio exceeds MAX_AUDIO_BYTES
- 415 unsupported_media: unsupported audio MIME type
- 422 empty_transcript: provider returned no transcript
- 502 provider_error: upstream provider rejected or failed the request
- 504 provider_timeout: upstream provider timed out

## Health endpoints

GET /healthz

Returns process liveness:

{ "ok": true, "service": "speech-to-text" }

GET /readyz

Returns readiness when provider configuration is available:

{ "ok": true, "model": "gpt-4o-transcribe", "provider": "openai" }

If provider configuration is missing, the route returns HTTP 503 with the standard error detail nested under ok:false.

## Admin endpoints

Admin endpoints are for operators, not ordinary transcription clients.

GET /admin
- Browser admin panel.

GET /admin/api/status
- Reads operational status, provider model, upload limit, timeout, and logging mode.

GET /admin/api/client-keys
- Lists sanitized client key metadata.
- Does not return token hashes or plaintext tokens.

POST /admin/api/client-keys
- JSON body: { "label": "talktome-device-name", "notes": "optional notes" }
- Returns a new plaintext client token once.
- Store it immediately in the client secret store.

DELETE /admin/api/client-keys/:id
- Revokes one client key.

GET /admin/api/logs?since=10%20minutes%20ago&limit=80
- Returns sanitized recent client audit logs.
- Logs include client IDs, labels, status codes, durations, MIME types, byte counts, and transcript character counts.
- Logs do not include bearer tokens, raw audio, or transcript text unless the server is explicitly configured with LOG_TRANSCRIPTS=true.

## Agent behavior checklist

When using this API from a local language model or tool agent:
- Start by reading /openapi.json if you need a strict schema.
- Use /readyz before transcription if you need to distinguish service-down from provider-not-configured.
- Send exactly one file field.
- Include language only when the caller has a useful language hint.
- Do not choose or override the model.
- Preserve request_id from success and error responses for operator debugging.
- Treat returned text as private user data.
- Do not retry 400, 401, 413, 415, or 422 without changing the request.
- Retry 502 or 504 only if the caller wants a retry and the audio upload can be safely repeated.
`;

module.exports = {
  LLMS_FULL_TXT,
  LLMS_TXT
};
