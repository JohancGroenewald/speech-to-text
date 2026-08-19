const assert = require('node:assert/strict');
const test = require('node:test');

const {
  OPENAI_TRANSCRIPTIONS_URL,
  extensionForMimeType,
  transcribeWithOpenAI
} = require('../src/transcribers/openai');

const BASE_REQUEST = {
  apiKey: 'sk-test',
  audioBuffer: Buffer.from('RIFFdata'),
  mimeType: 'audio/wav',
  language: ' en ',
  model: 'gpt-4o-transcribe',
  prompt: '  Preserve Slack and TalkToMe.  ',
  timeoutMs: 1000
};

test('builds the OpenAI multipart request and returns a trimmed transcript', async () => {
  let request;
  const result = await transcribeWithOpenAI({
    ...BASE_REQUEST,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse(200, { text: '  hello world  ' });
    }
  });

  assert.deepEqual(result, {
    text: 'hello world',
    model: 'gpt-4o-transcribe',
    provider: 'openai'
  });
  assert.equal(request.url, OPENAI_TRANSCRIPTIONS_URL);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer sk-test');
  assert.equal(request.options.body.get('model'), 'gpt-4o-transcribe');
  assert.equal(request.options.body.get('response_format'), 'json');
  assert.equal(request.options.body.get('language'), 'en');
  assert.equal(request.options.body.get('prompt'), 'Preserve Slack and TalkToMe.');
  const file = request.options.body.get('file');
  assert.equal(file.name, 'speech.wav');
  assert.equal(file.type, 'audio/wav');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), BASE_REQUEST.audioBuffer);
  assert.equal(request.options.signal.aborted, false);
});

test('omits empty optional hints from the OpenAI request', async () => {
  let form;
  await transcribeWithOpenAI({
    ...BASE_REQUEST,
    language: ' ',
    prompt: ' ',
    fetchImpl: async (_url, options) => {
      form = options.body;
      return jsonResponse(200, { text: 'hello' });
    }
  });

  assert.equal(form.has('language'), false);
  assert.equal(form.has('prompt'), false);
});

test('uses provider-compatible extensions for supported MIME aliases', () => {
  const cases = new Map([
    ['audio/wav', 'wav'],
    ['audio/x-wav', 'wav'],
    ['audio/webm', 'webm'],
    ['audio/mp4', 'mp4'],
    ['audio/mpeg', 'mp3'],
    ['audio/mp3', 'mp3'],
    ['audio/mpga', 'mp3'],
    ['audio/m4a', 'm4a'],
    ['audio/x-m4a', 'm4a']
  ]);

  for (const [mimeType, expected] of cases) {
    assert.equal(extensionForMimeType(mimeType), expected, mimeType);
  }
});

test('maps an OpenAI error response to provider_error', async () => {
  await assert.rejects(
    transcribeWithOpenAI({
      ...BASE_REQUEST,
      fetchImpl: async () => jsonResponse(429, { error: { message: 'rate limited upstream' } })
    }),
    (error) => {
      assert.equal(error.code, 'provider_error');
      assert.equal(error.statusCode, 502);
      assert.equal(error.message, 'rate limited upstream');
      return true;
    }
  );
});

test('maps malformed or empty successful responses to empty_transcript', async () => {
  await assert.rejects(
    transcribeWithOpenAI({
      ...BASE_REQUEST,
      fetchImpl: async () => textResponse(200, '<not-json>')
    }),
    (error) => {
      assert.equal(error.code, 'empty_transcript');
      assert.equal(error.statusCode, 422);
      return true;
    }
  );
});

test('aborts a slow OpenAI request and maps it to provider_timeout', async () => {
  await assert.rejects(
    transcribeWithOpenAI({
      ...BASE_REQUEST,
      timeoutMs: 5,
      fetchImpl: async (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            },
            { once: true }
          );
        })
    }),
    (error) => {
      assert.equal(error.code, 'provider_timeout');
      assert.equal(error.statusCode, 504);
      return true;
    }
  );
});

test('maps network failures to provider_error', async () => {
  await assert.rejects(
    transcribeWithOpenAI({
      ...BASE_REQUEST,
      fetchImpl: async () => {
        throw new Error('network unavailable');
      }
    }),
    (error) => {
      assert.equal(error.code, 'provider_error');
      assert.equal(error.statusCode, 502);
      assert.equal(error.message, 'network unavailable');
      return true;
    }
  );
});

function jsonResponse(status, body) {
  return textResponse(status, JSON.stringify(body));
}

function textResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body;
    }
  };
}
