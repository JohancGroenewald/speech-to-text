const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  HOST: '127.0.0.1',
  PORT: '7077',
  TRANSCRIPTION_MODEL: 'gpt-4o-transcribe',
  MAX_AUDIO_BYTES: '26214400',
  REQUEST_TIMEOUT_MS: '120000',
  LOG_TRANSCRIPTS: 'false',
  CLIENT_KEYS_FILE: '/etc/speech-to-text/client-keys.json'
};

function loadEnvFileIfPresent(filePath = process.env.ENV_FILE || '/opt/.env') {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const name = line.slice(0, separatorIndex).trim();
    const value = stripQuotes(line.slice(separatorIndex + 1).trim());
    if (name && process.env[name] === undefined) {
      process.env[name] = value;
    }
  }
}

function parseConfig(env = process.env) {
  const merged = { ...DEFAULTS, ...env };
  const port = parseInteger(merged.PORT, 'PORT', { min: 1, max: 65535 });
  const maxAudioBytes = parseInteger(merged.MAX_AUDIO_BYTES, 'MAX_AUDIO_BYTES', { min: 1 });
  const requestTimeoutMs = parseInteger(merged.REQUEST_TIMEOUT_MS, 'REQUEST_TIMEOUT_MS', {
    min: 1000
  });

  return {
    host: String(merged.HOST || DEFAULTS.HOST),
    port,
    openaiApiKey: String(merged.OPENAI_API_KEY || ''),
    transcriptionModel: String(merged.TRANSCRIPTION_MODEL || DEFAULTS.TRANSCRIPTION_MODEL),
    clientApiKeys: parseList(merged.SPEECH_TO_TEXT_API_KEYS || ''),
    clientKeysFile: path.resolve(String(merged.CLIENT_KEYS_FILE || DEFAULTS.CLIENT_KEYS_FILE)),
    adminApiToken: String(merged.ADMIN_API_TOKEN || ''),
    maxAudioBytes,
    requestTimeoutMs,
    logTranscripts: parseBoolean(merged.LOG_TRANSCRIPTS, false),
    nodeEnv: String(merged.NODE_ENV || 'development')
  };
}

function getReadiness(config) {
  const missing = [];
  if (!config.openaiApiKey) {
    missing.push({
      code: 'missing_provider_key',
      message: 'OPENAI_API_KEY is not configured.'
    });
  }
  if (config.clientApiKeys.length === 0 && !fs.existsSync(config.clientKeysFile)) {
    missing.push({
      code: 'missing_client_keys',
      message: 'No client API keys are configured.'
    });
  }
  if (!config.adminApiToken) {
    missing.push({
      code: 'missing_admin_token',
      message: 'ADMIN_API_TOKEN is not configured.'
    });
  }
  return {
    ok: missing.length === 0,
    missing
  };
}

function parseList(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseInteger(value, name, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER }) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

module.exports = {
  DEFAULTS,
  getReadiness,
  loadEnvFileIfPresent,
  parseConfig
};
