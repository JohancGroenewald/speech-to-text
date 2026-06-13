const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseJournalLogLines } = require('../src/admin/logs');
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
    adminLogReader: options.adminLogReader,
    logger: options.logger ?? false
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

test('logs per-client input and output metadata without secrets by default', async () => {
  const capture = createLogCapture();
  const app = createTestServer({ logger: capture.logger });
  const boundary = '----speech-to-text-test';
  const response = await app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: {
      authorization: 'Bearer client-token',
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'user-agent': 'talktome-test'
    },
    payload: multipartBody(boundary, [
      fieldPart(boundary, 'language', 'en'),
      filePart(boundary, 'file', 'sample.wav', 'audio/wav', Buffer.from('RIFFdata'))
    ])
  });

  assert.equal(response.statusCode, 200, response.body);
  const clientRequest = capture.record('client request received');
  const clientAudio = capture.record('client audio received');
  const transcriptionComplete = capture.record('transcription complete');
  const clientResponse = capture.record('client response sent');

  assert.equal(clientRequest.client_id, 'env-1');
  assert.equal(clientRequest.client_label, 'env-1');
  assert.equal(clientRequest.user_agent, 'talktome-test');
  assert.match(clientRequest.content_type, /^multipart\/form-data/);
  assert.equal(clientAudio.audio_bytes, 8);
  assert.equal(clientAudio.mime_type, 'audio/wav');
  assert.equal(clientAudio.language, 'en');
  assert.equal(transcriptionComplete.provider, 'openai');
  assert.equal(transcriptionComplete.model, 'gpt-4o-transcribe');
  assert.equal(clientResponse.status_code, 200);
  assert.equal(clientResponse.provider, 'openai');
  assert.equal(clientResponse.response_text_chars, response.json().text.length);
  assert.equal(clientResponse.transcript_logged, false);

  const logOutput = capture.text();
  assert.equal(logOutput.includes('client-token'), false);
  assert.equal(logOutput.includes('RIFFdata'), false);
  assert.equal(logOutput.includes(response.json().text), false);
});

test('logs authenticated client failures with client context', async () => {
  const capture = createLogCapture();
  const app = createTestServer({ logger: capture.logger });
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
  const clientResponse = capture.record('client response sent');
  const failedRequest = capture.record('request failed');
  assert.equal(clientResponse.client_id, 'env-1');
  assert.equal(clientResponse.status_code, 415);
  assert.equal(clientResponse.error_code, 'unsupported_media');
  assert.equal(failedRequest.client_id, 'env-1');
  assert.equal(failedRequest.code, 'unsupported_media');
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
  assert.match(response.body, /Client Logs/);
});

test('admin APIs require admin token', async () => {
  const app = createTestServer();
  const response = await app.inject({ method: 'GET', url: '/admin/api/status' });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, 'unauthorized');
});

test('admin can read sanitized client logs', async () => {
  let query;
  const app = createTestServer({
    adminLogReader: {
      async readLogs(options) {
        query = options;
        return [
          {
            timestamp: '2026-06-13T21:50:00.000Z',
            event: 'client response sent',
            request_id: 'req_test',
            client_id: 'env-1',
            client_label: 'env-1',
            status_code: 200,
            duration_ms: 123,
            response_text_chars: 11,
            transcript_logged: false
          }
        ];
      }
    }
  });
  const response = await app.inject({
    method: 'GET',
    url: '/admin/api/logs?since=5%20minutes%20ago&limit=12',
    headers: { authorization: 'Bearer admin-token' }
  });

  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(query, {
    since: '5 minutes ago',
    limit: '12'
  });
  assert.equal(response.json().logs.length, 1);
  assert.equal(response.json().logs[0].event, 'client response sent');
  assert.equal(response.json().logs[0].response_text_chars, 11);
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

test('journal parser returns only sanitized client audit events', () => {
  const output = [
    journalLine({
      msg: 'client request received',
      request_id: 'req_one',
      client_id: 'key_one',
      client_label: 'talktome-one',
      method: 'POST',
      route: '/v1/transcriptions',
      content_length: '100',
      content_type: 'multipart/form-data'
    }),
    journalLine({
      msg: 'transcript text',
      request_id: 'req_one',
      text: 'secret transcript'
    }),
    journalLine({
      msg: 'client response sent',
      request_id: 'req_one',
      client_id: 'key_one',
      status_code: 200,
      response_text_chars: 17,
      transcript_logged: false
    })
  ].join('\n');

  const logs = parseJournalLogLines(output);
  assert.equal(logs.length, 2);
  assert.equal(logs[0].event, 'client request received');
  assert.equal(logs[1].event, 'client response sent');
  assert.equal(JSON.stringify(logs).includes('secret transcript'), false);
  assert.equal(Object.hasOwn(logs[0], 'text'), false);
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

function createLogCapture() {
  const records = [];
  const lines = [];
  return {
    logger: {
      level: 'info',
      redact: ['req.headers.authorization'],
      stream: {
        write(line) {
          const trimmed = line.trim();
          if (!trimmed) {
            return;
          }
          lines.push(trimmed);
          records.push(JSON.parse(trimmed));
        }
      }
    },
    record(message) {
      const found = records.find((entry) => entry.msg === message);
      assert.ok(found, `Expected log message: ${message}`);
      return found;
    },
    text() {
      return lines.join('\n');
    }
  };
}

function journalLine(payload) {
  return JSON.stringify({
    __REALTIME_TIMESTAMP: '1781387400000000',
    MESSAGE: JSON.stringify({
      level: 30,
      time: 1781387400000,
      hostname: 'speech-to-text',
      ...payload
    })
  });
}
