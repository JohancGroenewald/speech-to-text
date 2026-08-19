const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createClientKeyManager } = require('../src/auth/clientKeys');
const { buildServer, MAX_PROMPT_CHARS } = require('../src/server');

test('forwards a trimmed prompt and applies requested Slack formatting', async (t) => {
  let transcriptionRequest;
  const capture = createLogCapture();
  const app = createTestServer({
    logger: capture.logger,
    transcriber: async (request) => {
      transcriptionRequest = request;
      return {
        text: 'At channel, notify at here but leave at Johan for review.',
        model: request.model,
        provider: 'openai'
      };
    }
  });
  t.after(() => app.close());

  const prompt = [
    'Transcribe this as a Slack message.',
    'Write “at channel” as “@channel” and “at here” as “@here”.',
    'Do not invent mentions.'
  ].join('\n');
  const response = await transcribe(app, [fieldPart('prompt', `  ${prompt}  `)]);

  assert.equal(response.statusCode, 200, response.body);
  assert.equal(transcriptionRequest.prompt, prompt);
  assert.equal(
    response.json().text,
    '@channel, notify @here but leave at Johan for review.'
  );

  const audioLog = capture.record('client audio received');
  assert.equal(audioLog.prompt_present, true);
  assert.equal(audioLog.prompt_chars, prompt.length);
  assert.equal(capture.text().includes(prompt), false);
});

test('leaves spoken Slack-like phrases unchanged without an opt-in prompt', async (t) => {
  const app = createTestServer({
    transcriber: async (request) => ({
      text: 'Meet me at channel four and wait at here.',
      model: request.model,
      provider: 'openai'
    })
  });
  t.after(() => app.close());

  const response = await transcribe(app);

  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().text, 'Meet me at channel four and wait at here.');
});

test('rejects prompts over the service limit before calling the provider', async (t) => {
  let providerCalled = false;
  const app = createTestServer({
    transcriber: async () => {
      providerCalled = true;
    }
  });
  t.after(() => app.close());

  const response = await transcribe(app, [fieldPart('prompt', 'x'.repeat(MAX_PROMPT_CHARS + 1))]);

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, 'invalid_request');
  assert.match(response.json().error.message, /must not exceed 2000 characters/);
  assert.equal(providerCalled, false);
});

test('accepts the maximum prompt when every character uses four UTF-8 bytes', async (t) => {
  let receivedPrompt;
  const app = createTestServer({
    transcriber: async (request) => {
      receivedPrompt = request.prompt;
      return { text: 'hello', model: request.model, provider: 'openai' };
    }
  });
  t.after(() => app.close());
  const prompt = '😀'.repeat(MAX_PROMPT_CHARS);

  const response = await transcribe(app, [fieldPart('prompt', prompt)]);

  assert.equal(response.statusCode, 200, response.body);
  assert.equal([...receivedPrompt].length, MAX_PROMPT_CHARS);
});

function createTestServer({ transcriber, logger = false }) {
  const keysFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'speech-to-text-prompt-')),
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
    transcriber,
    logger
  });
}

async function transcribe(app, fields = []) {
  const boundary = '----speech-to-text-prompt-test';
  return app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: {
      authorization: 'Bearer client-token',
      'content-type': `multipart/form-data; boundary=${boundary}`
    },
    payload: Buffer.concat([
      ...fields.map((field) => multipartField(boundary, field)),
      filePart(boundary),
      Buffer.from(`--${boundary}--\r\n`)
    ])
  });
}

function fieldPart(name, value) {
  return { name, value };
}

function multipartField(boundary, { name, value }) {
  return Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
      `${value}\r\n`
  );
}

function filePart(boundary) {
  return Buffer.from(
    `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="file"; filename="sample.wav"\r\n' +
      'Content-Type: audio/wav\r\n\r\n' +
      'RIFFdata\r\n'
  );
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
          if (trimmed) {
            lines.push(trimmed);
            records.push(JSON.parse(trimmed));
          }
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
