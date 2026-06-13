const {
  emptyTranscript,
  providerError,
  providerTimeout
} = require('../errors');

const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';

async function transcribeWithOpenAI({
  apiKey,
  audioBuffer,
  mimeType,
  language = '',
  model,
  timeoutMs,
  fetchImpl = fetch
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const form = new FormData();
    form.set('model', model);
    form.set('response_format', 'json');
    if (language.trim()) {
      form.set('language', language.trim());
    }
    form.set('file', new Blob([audioBuffer], { type: mimeType }), `speech.${extensionForMimeType(mimeType)}`);

    const response = await fetchImpl(OPENAI_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form,
      signal: controller.signal
    });

    const bodyText = await response.text();
    let parsed = {};
    if (bodyText) {
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        parsed = {};
      }
    }

    if (!response.ok) {
      throw providerError(parsed.error?.message || `OpenAI request failed with HTTP ${response.status}.`);
    }

    const text = String(parsed.text || '').trim();
    if (!text) {
      throw emptyTranscript('OpenAI returned an empty transcript.');
    }

    return {
      text,
      model,
      provider: 'openai'
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw providerTimeout('OpenAI transcription timed out.', error);
    }
    if (error.code && error.statusCode) {
      throw error;
    }
    throw providerError(error.message || 'OpenAI transcription failed.', error);
  } finally {
    clearTimeout(timeout);
  }
}

function extensionForMimeType(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('mp4')) {
    return 'mp4';
  }
  if (normalized.includes('mpeg') || normalized.includes('mp3') || normalized.includes('mpga')) {
    return 'mp3';
  }
  if (normalized.includes('wav')) {
    return 'wav';
  }
  if (normalized.includes('m4a')) {
    return 'm4a';
  }
  return 'webm';
}

module.exports = {
  OPENAI_TRANSCRIPTIONS_URL,
  extensionForMimeType,
  transcribeWithOpenAI
};
