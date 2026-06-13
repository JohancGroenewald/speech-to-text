const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createClientKeyManager } = require('../src/auth/clientKeys');
const { parseConfig } = require('../src/config');
const { emptyTranscript, providerError } = require('../src/errors');
const { buildServer } = require('../src/server');

function createTestServer(options = {}) {
  const keysFile =
    options.keysFile ||
    path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'speech-to-text-server-')), 'client-keys.json');
  const config = {
    host: '127.0.0.1',
    port: 0,
    openaiApiKey: 'sk-test',
    transcriptionModel: 'gpt-4o-transcribe',
    clientApiKeys: ['client-token'],
    clientKeysFile: keysFile,
    adminApiToken: 'admin-token',
    maxAudioBytes: 1024,
    requestTimeoutMs: 120000,
    logTranscripts: false,
    nodeEnv: 'test',
    ...options.config
  };
  const keyManager = createClientKeyManager({
    envTokens: config.clientApiKeys,
    keysFile: config.clientKeysFile
  });
  const transcriber =
    options.transcriber ||
    (async ({ language, model, mimeType, audioBuffer }) => ({
      text: `hello ${language || 'auto'} ${mimeType} ${audioBuffer.length}`,
      model,
      provider: 'openai'
    }));
  return buildServer({
    config,
    keyManager,
    transcriber,
    logger: false
  });
}

test('healthz returns liveness', async () => {
  const app = createTestServer();
  const response = await app.inject({ method: 'GET', url: '/healthz' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    service: 'speech-to-text'
  });
});

test('readyz returns provider readiness', async () => {
  const app = createTestServer();
  const response = await app.inject({ method: 'GET', url: '/readyz' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);
  assert.equal(response.json().model, 'gpt-4o-transcribe');
});

test('readyz reports missing provider key', async () => {
  const app = createTestServer({ config: { openaiApiKey: '' } });
  const response = await app.inject({ method: 'GET', url: '/readyz' });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().ok, false);
  assert.equal(response.json().error.code, 'missing_provider_key');
});

test('root route redirects to admin frontend', async () => {
  const app = createTestServer();
  const response = await app.inject({ method: 'GET', url: '/' });

  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.location, '/admin');
});

test('favicon route returns no content', async () => {
  const app = createTestServer();
  const response = await app.inject({ method: 'GET', url: '/favicon.ico' });

  assert.equal(response.statusCode, 204);
  assert.equal(response.body, '');
});

test('config parser applies defaults and validates numeric values', () => {
  const config = parseConfig({
    OPENAI_API_KEY: 'sk-test',
    SPEECH_TO_TEXT_API_KEYS: 'one,two',
    ADMIN_API_TOKEN: 'admin'
  });

  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 7077);
  assert.equal(config.transcriptionModel, 'gpt-4o-transcribe');
  assert.deepEqual(config.clientApiKeys, ['one', 'two']);
  assert.throws(() => parseConfig({ PORT: 'not-a-port' }), /PORT must be an integer/);
});

test('transcription requires bearer auth', async () => {
  const app = createTestServer();
  const response = await app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: { 'content-type': 'multipart/form-data' },
    payload: ''
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, 'unauthorized');
});

test('transcribes multipart audio with optional language', async () => {
  const app = createTestServer();
  const boundary = '----speech-to-text-test';
  const response = await app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: {
      authorization: 'Bearer client-token',
      'content-type': `multipart/form-data; boundary=${boundary}`
    },
    payload: multipartBody(boundary, [
      fieldPart(boundary, 'language', 'en'),
      filePart(boundary, 'file', 'sample.wav', 'audio/wav', Buffer.from('RIFFdata'))
    ])
  });

  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.equal(body.text, 'hello en audio/wav 8');
  assert.equal(body.model, 'gpt-4o-transcribe');
  assert.equal(body.provider, 'openai');
  assert.match(body.request_id, /^req_/);
});

test('rejects unsupported MIME types', async () => {
  const app = createTestServer();
  const boundary = '----speech-to-text-test';
  const response = await app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: {
      authorization: 'Bearer client-token',
      'content-type': `multipart/form-data; boundary=${boundary}`
    },
    payload: multipartBody(boundary, [
      filePart(boundary, 'file', 'sample.txt', 'text/plain', Buffer.from('not-audio'))
    ])
  });

  assert.equal(response.statusCode, 415);
  assert.equal(response.json().error.code, 'unsupported_media');
});

test('rejects oversized audio', async () => {
  const app = createTestServer({ config: { maxAudioBytes: 4 } });
  const boundary = '----speech-to-text-test';
  const response = await app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: {
      authorization: 'Bearer client-token',
      'content-type': `multipart/form-data; boundary=${boundary}`
    },
    payload: multipartBody(boundary, [
      filePart(boundary, 'file', 'sample.wav', 'audio/wav', Buffer.from('12345'))
    ])
  });

  assert.equal(response.statusCode, 413);
  assert.equal(response.json().error.code, 'audio_too_large');
});

test('rejects client model override', async () => {
  const app = createTestServer();
  const boundary = '----speech-to-text-test';
  const response = await app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: {
      authorization: 'Bearer client-token',
      'content-type': `multipart/form-data; boundary=${boundary}`
    },
    payload: multipartBody(boundary, [
      fieldPart(boundary, 'model', 'other-model'),
      filePart(boundary, 'file', 'sample.wav', 'audio/wav', Buffer.from('RIFF'))
    ])
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, 'invalid_request');
});

test('maps provider failures to stable error responses', async () => {
  const app = createTestServer({
    transcriber: async () => {
      throw providerError('Provider said no.');
    }
  });
  const boundary = '----speech-to-text-test';
  const response = await app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: {
      authorization: 'Bearer client-token',
      'content-type': `multipart/form-data; boundary=${boundary}`
    },
    payload: multipartBody(boundary, [
      filePart(boundary, 'file', 'sample.wav', 'audio/wav', Buffer.from('RIFF'))
    ])
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error.code, 'provider_error');
  assert.match(response.json().error.request_id, /^req_/);
});

test('maps empty transcripts to 422', async () => {
  const app = createTestServer({
    transcriber: async () => {
      throw emptyTranscript();
    }
  });
  const boundary = '----speech-to-text-test';
  const response = await app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: {
      authorization: 'Bearer client-token',
      'content-type': `multipart/form-data; boundary=${boundary}`
    },
    payload: multipartBody(boundary, [
      filePart(boundary, 'file', 'sample.wav', 'audio/wav', Buffer.from('RIFF'))
    ])
  });

  assert.equal(response.statusCode, 422);
  assert.equal(response.json().error.code, 'empty_transcript');
});

test('serves the admin frontend shell', async () => {
  const app = createTestServer();
  const response = await app.inject({ method: 'GET', url: '/admin' });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /text\/html/);
  assert.match(response.body, /Speech-to-Text Admin/);
  assert.match(response.body, /themeToggle/);
  assert.match(response.body, /TalkToMe Settings/);
});

test('admin APIs require admin token', async () => {
  const app = createTestServer();
  const response = await app.inject({ method: 'GET', url: '/admin/api/status' });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, 'unauthorized');
});

test('admin can create, list, and revoke client keys', async () => {
  const app = createTestServer({ config: { clientApiKeys: [] } });
  const headers = {
    authorization: 'Bearer admin-token',
    'content-type': 'application/json'
  };

  const createdResponse = await app.inject({
    method: 'POST',
    url: '/admin/api/client-keys',
    headers,
    payload: JSON.stringify({ label: 'talktome-test', notes: 'one machine' })
  });

  assert.equal(createdResponse.statusCode, 201, createdResponse.body);
  const created = createdResponse.json();
  assert.match(created.token, /^stt_/);
  assert.equal(created.key.label, 'talktome-test');
  assert.equal(Object.hasOwn(created.key, 'hash'), false);

  const listResponse = await app.inject({
    method: 'GET',
    url: '/admin/api/client-keys',
    headers
  });
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.json().keys.length, 1);
  assert.equal(Object.hasOwn(listResponse.json().keys[0], 'hash'), false);

  const authResponse = await app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: {
      authorization: `Bearer ${created.token}`,
      'content-type': 'multipart/form-data; boundary=----speech-to-text-test'
    },
    payload: multipartBody('----speech-to-text-test', [
      filePart('----speech-to-text-test', 'file', 'sample.wav', 'audio/wav', Buffer.from('RIFF'))
    ])
  });
  assert.equal(authResponse.statusCode, 200, authResponse.body);

  const revokeResponse = await app.inject({
    method: 'DELETE',
    url: `/admin/api/client-keys/${created.key.id}`,
    headers: { authorization: 'Bearer admin-token' }
  });
  assert.equal(revokeResponse.statusCode, 200);

  const revokedAuthResponse = await app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: {
      authorization: `Bearer ${created.token}`,
      'content-type': 'multipart/form-data; boundary=----speech-to-text-test'
    },
    payload: multipartBody('----speech-to-text-test', [
      filePart('----speech-to-text-test', 'file', 'sample.wav', 'audio/wav', Buffer.from('RIFF'))
    ])
  });
  assert.equal(revokedAuthResponse.statusCode, 401);
});

function multipartBody(boundary, parts) {
  return Buffer.concat([...parts, Buffer.from(`--${boundary}--\r\n`)]);
}

function fieldPart(boundary, name, value) {
  return Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
      `${value}\r\n`
  );
}

function filePart(boundary, name, filename, contentType, body) {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${name}"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`
    ),
    body,
    Buffer.from('\r\n')
  ]);
}
