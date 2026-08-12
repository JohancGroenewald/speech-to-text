# API Contract

Base URL on the trusted Huis LAN:

```text
https://speech-to-text.huis
```

The canonical machine-readable contract is available from `GET /openapi.json`.

## Discovery

These routes are public on the LAN and do not grant transcription or admin
access:

```text
GET /llms.txt       concise LLM-oriented usage guide
GET /llms-full.txt  detailed LLM-oriented usage guide
GET /openapi.json   OpenAPI 3.1 document
```

## Authentication

Transcription requests require a client token:

```http
Authorization: Bearer <client-token>
```

Admin API requests require the separate admin credential:

```http
Authorization: Bearer <ADMIN_API_TOKEN>
```

The deployed service can validate client tokens from two sources:

- `SPEECH_TO_TEXT_API_KEYS`, intended for bootstrap or simple tests;
- the managed hashed JSON store at `CLIENT_KEYS_FILE`.

Generated managed tokens are returned in plaintext only once. Their hashes,
labels, notes, creation time, last-used time, and revocation state remain in the
store. Do not send a client token to an admin route or the admin token to the
transcription route.

## POST `/v1/transcriptions`

Transcribe one complete audio file.

```http
POST /v1/transcriptions HTTP/1.1
Authorization: Bearer <client-token>
Content-Type: multipart/form-data; boundary=...
```

Multipart fields:

```text
file      required  one audio file, maximum 26214400 bytes (25 MiB)
language  optional  language hint, for example en or af
```

The transcription model is controlled by the server. A client-supplied `model`
field or any unknown field produces `400 invalid_request`.

Supported audio MIME types:

```text
audio/wav
audio/wave
audio/x-wav
audio/webm
audio/mp4
audio/mpeg
audio/mp3
audio/m4a
audio/x-m4a
audio/mpga
```

Example:

```bash
curl -fsS \
  -H "Authorization: Bearer $SPEECH_TO_TEXT_CLIENT_KEY" \
  -F "file=@sample.wav;type=audio/wav" \
  -F "language=en" \
  https://speech-to-text.huis/v1/transcriptions
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

The service trims surrounding whitespace from provider transcript text. An
empty result is an error rather than a successful response.

### Error Responses

Transcription and admin API errors use this envelope:

```json
{
  "error": {
    "code": "audio_too_large",
    "message": "Audio exceeds the 26214400 byte limit.",
    "request_id": "req_01J..."
  }
}
```

Implemented transcription status codes:

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | Missing file, unsupported field, multipart count violation, or malformed request. |
| 401 | `unauthorized` | Missing or invalid client token. |
| 413 | `audio_too_large` | The audio file exceeds `MAX_AUDIO_BYTES`. |
| 415 | `unsupported_media` | The declared audio MIME type is not supported. |
| 422 | `empty_transcript` | The provider returned no transcript text. |
| 502 | `provider_error` | OpenAI rejected the request or the provider call failed. |
| 504 | `provider_timeout` | The OpenAI request exceeded `REQUEST_TIMEOUT_MS`. |

Do not automatically retry 400, 401, 413, 415, or 422 responses. Retry 502 or
504 only when the caller permits it and the audio can be submitted safely again.

## GET `/healthz`

Liveness only. This route does not inspect configuration or call OpenAI.

```json
{
  "ok": true,
  "service": "speech-to-text"
}
```

## GET `/readyz`

Readiness validates local configuration and key-store contents without making a
provider request. A ready response is:

```json
{
  "ok": true,
  "model": "gpt-4o-transcribe",
  "provider": "openai"
}
```

An unready response has HTTP 503 and returns the first detected problem:

```json
{
  "ok": false,
  "error": {
    "code": "missing_provider_key",
    "message": "OPENAI_API_KEY is not configured."
  }
}
```

Possible readiness codes:

| Code | Meaning |
| --- | --- |
| `missing_provider_key` | `OPENAI_API_KEY` is empty. |
| `missing_client_keys` | Neither an environment client token nor an active managed key exists. |
| `invalid_client_keys` | The managed key store cannot be read or validated. |
| `missing_admin_token` | `ADMIN_API_TOKEN` is empty. |

Readiness does not prove that OpenAI is reachable or that its credential is
accepted; those conditions are exercised only by a transcription request.

## Admin UI and API

`GET /admin` serves the browser UI without embedding credentials. The operator
enters the admin token, which the frontend keeps in browser `sessionStorage` and
sends as a bearer token to `/admin/api/*`.

### GET `/admin/api/status`

Returns readiness details, service and provider names, model, Node.js version,
audio limit, provider timeout, and transcript-logging mode.

### GET `/admin/api/client-keys`

Returns environment-token labels and sanitized managed-key metadata. It never
returns hashes or plaintext tokens.

### POST `/admin/api/client-keys`

Creates a managed client token.

```json
{
  "label": "talktome-laptop",
  "notes": "Optional operator context"
}
```

The HTTP 201 response contains `token` once and a sanitized `key` record. Store
the token in the client secret store before dismissing it.

### DELETE `/admin/api/client-keys/{id}`

Revokes a managed client key. Environment-sourced tokens cannot be revoked from
the admin API; remove them from the service environment and restart instead.

### GET `/admin/api/logs`

Query parameters:

- `since`: a `journalctl --since` expression; default `10 minutes ago`;
- `limit`: returned event count, clamped to 1 through 200; default 80.

The response contains only allowlisted audit metadata. It excludes bearer
tokens, raw audio, and transcript text, including when transcript logging is
enabled elsewhere in the service journal.

## Logging and Privacy

Authenticated transcription requests generate request, audio, completion,
response, and failure metadata events as applicable. They include identifiers,
sizes, MIME types, status, latency, provider, and model. Authorization headers
are redacted. Transcript text is logged only when `LOG_TRANSCRIPTS=true`; raw
audio is never logged.
