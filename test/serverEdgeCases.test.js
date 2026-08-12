const assert = require('node:assert/strict');
const test = require('node:test');

const { buildServer } = require('../src/server');

function createTestServer({ logger = false } = {}) {
  return buildServer({
    config: {
      host: '127.0.0.1',
      port: 0,
      openaiApiKey: 'sk-test',
      transcriptionModel: 'gpt-4o-transcribe',
      clientApiKeys: ['client-token'],
      clientKeysFile: '/unused/client-keys.json',
      adminApiToken: 'admin-token',
      maxAudioBytes: 1024,
      requestTimeoutMs: 120000,
      logTranscripts: false,
      nodeEnv: 'test'
    },
    logger,
    transcriber: async () => ({
      text: 'hello',
      model: 'gpt-4o-transcribe',
      provider: 'openai'
    })
  });
}

test('trusts forwarded client addresses only through the loopback proxy', async () => {
  const records = [];
  const app = createTestServer({
    logger: {
      level: 'info',
      stream: {
        write(line) {
          records.push(JSON.parse(line));
        }
      }
    }
  });
  const response = await app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    remoteAddress: '127.0.0.1',
    headers: {
      authorization: 'Bearer client-token',
      'content-type': 'text/plain',
      'x-forwarded-for': '192.0.2.44'
    },
    payload: 'not multipart'
  });

  assert.equal(response.statusCode, 400);
  const spoofedResponse = await app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    remoteAddress: '198.51.100.10',
    headers: {
      authorization: 'Bearer client-token',
      'content-type': 'text/plain',
      'x-forwarded-for': '203.0.113.99'
    },
    payload: 'not multipart'
  });
  assert.equal(spoofedResponse.statusCode, 400);
  const requestLogs = records.filter((record) => record.msg === 'client request received');
  assert.equal(requestLogs[0].remote_address, '192.0.2.44');
  assert.equal(requestLogs[1].remote_address, '198.51.100.10');
  await app.close();
});

test('maps multipart file-count violations to invalid_request', async () => {
  const app = createTestServer();
  const boundary = '----speech-to-text-files-limit';
  const response = await sendMultipart(app, boundary, [
    filePart(boundary, 'first.wav', 'one'),
    filePart(boundary, 'second.wav', 'two')
  ]);

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, 'invalid_request');
  assert.match(response.json().error.message, /Only one audio file/);
  await app.close();
});

test('maps multipart field-count violations to invalid_request', async () => {
  const app = createTestServer();
  const boundary = '----speech-to-text-fields-limit';
  const response = await sendMultipart(app, boundary, [
    fieldPart(boundary, 'language', 'en'),
    fieldPart(boundary, 'language', 'af'),
    fieldPart(boundary, 'language', 'de'),
    fieldPart(boundary, 'language', 'fr')
  ]);

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, 'invalid_request');
  assert.match(response.json().error.message, /too many fields/);
  await app.close();
});

function sendMultipart(app, boundary, parts) {
  return app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: {
      authorization: 'Bearer client-token',
      'content-type': `multipart/form-data; boundary=${boundary}`
    },
    payload: Buffer.concat([...parts, Buffer.from(`--${boundary}--\r\n`)])
  });
}

function fieldPart(boundary, name, value) {
  return Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
      `${value}\r\n`
  );
}

function filePart(boundary, filename, value) {
  return Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      'Content-Type: audio/wav\r\n\r\n' +
      `${value}\r\n`
  );
}
