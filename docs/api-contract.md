# API Contract

Base URL for the LAN service:

```text
http://speech-to-text.huis:7077
```

## Authentication

Every transcription request must include:

```text
Authorization: Bearer <client-token>
```

The server validates the token against `SPEECH_TO_TEXT_API_KEYS`.

Health routes may stay unauthenticated while the service is LAN-only. If exposed through a reverse proxy, require authentication there too.

## POST /v1/transcriptions

Transcribe one complete audio file.

Request:

```http
POST /v1/transcriptions HTTP/1.1
Authorization: Bearer <client-token>
Content-Type: multipart/form-data
```

Multipart fields:

```text
file      required  audio file, max 25 MB
language  optional  language hint, for example en or af
model     optional  defaults to server TRANSCRIPTION_MODEL
```

Supported first-pass audio types:

```text
audio/wav
audio/webm
audio/mp4
audio/mpeg
audio/mp3
audio/m4a
```

Successful response:

```json
{
  "text": "The transcribed text.",
  "model": "gpt-4o-transcribe",
  "provider": "openai",
  "duration_ms": 842,
  "request_id": "req_01J..."
}
```

Errors:

```json
{
  "error": {
    "code": "audio_too_large",
    "message": "Audio exceeds the 25 MB limit.",
    "request_id": "req_01J..."
  }
}
```

Recommended status codes:

```text
400 invalid_request       Missing file, unsupported fields, malformed multipart
401 unauthorized          Missing or invalid client token
413 audio_too_large       Audio exceeds MAX_AUDIO_BYTES
415 unsupported_media     Unsupported audio MIME type
422 empty_transcript      Provider returned no transcript
429 rate_limited          Future per-client rate limiting
502 provider_error        OpenAI rejected or failed the request
504 provider_timeout      OpenAI request timed out
```

Example:

```bash
curl -sS \
  -H "Authorization: Bearer $SPEECH_TO_TEXT_CLIENT_KEY" \
  -F "file=@sample.wav;type=audio/wav" \
  -F "language=en" \
  http://speech-to-text.huis:7077/v1/transcriptions
```

## GET /healthz

Liveness check. It should only confirm that the HTTP process is running.

Response:

```json
{
  "ok": true,
  "service": "speech-to-text"
}
```

## GET /readyz

Readiness check. It should confirm that required configuration is present, without calling OpenAI on every probe.

Response:

```json
{
  "ok": true,
  "model": "gpt-4o-transcribe",
  "provider": "openai"
}
```

If `OPENAI_API_KEY` is missing:

```json
{
  "ok": false,
  "error": {
    "code": "missing_provider_key",
    "message": "OPENAI_API_KEY is not configured."
  }
}
```

