const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createClientKeyManager } = require('../src/auth/clientKeys');
const { buildServer } = require('../src/server');

function createTestServer() {
  const keysFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'speech-to-text-discovery-')),
    'client-keys.json'
  );
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
    nodeEnv: 'test'
  };
  return buildServer({
    config,
    keyManager: createClientKeyManager({
      envTokens: config.clientApiKeys,
      keysFile: config.clientKeysFile
    }),
    logger: false
  });
}

test('serves short LLM discovery guide', async () => {
  const app = createTestServer();
  const response = await app.inject({ method: 'GET', url: '/llms.txt' });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /text\/plain/);
  assert.match(response.body, /OpenAPI schema: https:\/\/speech-to-text\.huis\/openapi\.json/);
  assert.match(response.body, /POST \/v1\/transcriptions/);
  assert.match(response.body, /Authorization: Bearer <client-token>/);
  assert.match(response.body, /Do not send a model field/);
});

test('serves detailed LLM discovery guide', async () => {
  const app = createTestServer();
  const response = await app.inject({ method: 'GET', url: '/llms-full.txt' });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /text\/plain/);
  assert.match(response.body, /audio\/x-wav/);
  assert.match(response.body, /model: forbidden in v1/);
  assert.match(response.body, /ADMIN_API_TOKEN/);
  assert.match(response.body, /Retry 502 or 504/);
});

test('serves OpenAPI discovery schema', async () => {
  const app = createTestServer();
  const response = await app.inject({ method: 'GET', url: '/openapi.json' });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /application\/json/);

  const body = response.json();
  assert.equal(body.openapi, '3.1.0');
  assert.equal(body.info.title, 'Huis Speech-to-Text API');
  assert.ok(body.paths['/v1/transcriptions'].post);
  assert.ok(body.paths['/llms.txt'].get);
  assert.ok(body.components.securitySchemes.clientBearer);
  assert.ok(body.components.securitySchemes.adminBearer);
});
