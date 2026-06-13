const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const TOKEN_PREFIX = 'stt';

function createClientKeyManager({ envTokens = [], keysFile }) {
  const envKeys = envTokens.map((token, index) => ({
    id: `env-${index + 1}`,
    label: `env-${index + 1}`,
    hash: hashToken(token),
    source: 'env',
    revoked_at: null
  }));

  function listKeys() {
    const store = readStore(keysFile);
    return [
      ...envKeys.map((key) => ({
        id: key.id,
        label: key.label,
        source: key.source,
        created_at: null,
        last_used_at: null,
        revoked_at: null
      })),
      ...store.keys.map(redactStoredKey)
    ];
  }

  function createKey({ label, notes = '' }) {
    const normalizedLabel = String(label || '').trim();
    if (!normalizedLabel) {
      throw new Error('Client key label is required.');
    }

    const token = generateToken();
    const now = new Date().toISOString();
    const store = readStore(keysFile);
    const key = {
      id: `key_${crypto.randomBytes(10).toString('hex')}`,
      label: normalizedLabel,
      notes: String(notes || '').trim(),
      hash: hashToken(token),
      source: 'file',
      created_at: now,
      last_used_at: null,
      revoked_at: null
    };
    store.keys.push(key);
    writeStore(keysFile, store);

    return {
      token,
      key: redactStoredKey(key)
    };
  }

  function revokeKey(id) {
    const store = readStore(keysFile);
    const key = store.keys.find((candidate) => candidate.id === id);
    if (!key) {
      return false;
    }
    if (!key.revoked_at) {
      key.revoked_at = new Date().toISOString();
      writeStore(keysFile, store);
    }
    return true;
  }

  function verifyToken(token) {
    const normalizedToken = String(token || '').trim();
    if (!normalizedToken) {
      return undefined;
    }
    const tokenHash = hashToken(normalizedToken);

    const envMatch = envKeys.find((key) => safeEqual(key.hash, tokenHash));
    if (envMatch) {
      return {
        id: envMatch.id,
        label: envMatch.label,
        source: envMatch.source
      };
    }

    const store = readStore(keysFile);
    const key = store.keys.find(
      (candidate) => !candidate.revoked_at && safeEqual(candidate.hash, tokenHash)
    );
    if (!key) {
      return undefined;
    }

    key.last_used_at = new Date().toISOString();
    writeStore(keysFile, store);

    return {
      id: key.id,
      label: key.label,
      source: 'file'
    };
  }

  return {
    createKey,
    listKeys,
    revokeKey,
    verifyToken
  };
}

function generateToken() {
  return `${TOKEN_PREFIX}_${crypto.randomBytes(32).toString('base64url')}`;
}

function hashToken(token) {
  return `sha256:${crypto.createHash('sha256').update(String(token)).digest('hex')}`;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readStore(keysFile) {
  if (!keysFile || !fs.existsSync(keysFile)) {
    return { keys: [] };
  }
  const parsed = JSON.parse(fs.readFileSync(keysFile, 'utf8'));
  if (!parsed || !Array.isArray(parsed.keys)) {
    return { keys: [] };
  }
  return parsed;
}

function writeStore(keysFile, store) {
  if (!keysFile) {
    throw new Error('CLIENT_KEYS_FILE is not configured.');
  }
  fs.mkdirSync(path.dirname(keysFile), { recursive: true, mode: 0o700 });
  const tempPath = `${keysFile}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, keysFile);
  fs.chmodSync(keysFile, 0o600);
}

function redactStoredKey(key) {
  return {
    id: key.id,
    label: key.label,
    notes: key.notes || '',
    source: key.source || 'file',
    created_at: key.created_at || null,
    last_used_at: key.last_used_at || null,
    revoked_at: key.revoked_at || null
  };
}

module.exports = {
  createClientKeyManager,
  generateToken,
  hashToken
};
