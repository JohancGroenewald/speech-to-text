class ApiError extends Error {
  constructor(statusCode, code, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.expose = options.expose !== false;
    this.cause = options.cause;
  }
}

function invalidRequest(message) {
  return new ApiError(400, 'invalid_request', message);
}

function unauthorized(message = 'Missing or invalid client token.') {
  return new ApiError(401, 'unauthorized', message);
}

function audioTooLarge(message = 'Audio exceeds the configured size limit.') {
  return new ApiError(413, 'audio_too_large', message);
}

function unsupportedMedia(message = 'Unsupported audio MIME type.') {
  return new ApiError(415, 'unsupported_media', message);
}

function emptyTranscript(message = 'Provider returned no transcript.') {
  return new ApiError(422, 'empty_transcript', message);
}

function providerError(message = 'Transcription provider failed.', cause) {
  return new ApiError(502, 'provider_error', message, { cause, expose: true });
}

function providerTimeout(message = 'Transcription provider timed out.', cause) {
  return new ApiError(504, 'provider_timeout', message, { cause, expose: true });
}

module.exports = {
  ApiError,
  audioTooLarge,
  emptyTranscript,
  invalidRequest,
  providerError,
  providerTimeout,
  unauthorized,
  unsupportedMedia
};
