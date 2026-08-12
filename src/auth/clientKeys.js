const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const TOKEN_PREFIX = 'stt';
const DEFAULT_USAGE_FLUSH_DELAY_MS = 1000;
const STORED_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

function createClientKeyManager({
  envTokens = [],
  keysFile,
  usageFlushDelayMs = DEFAULT_USAGE_FLUSH_DELAY_MS,
  onUsagePersistenceError = () => {},
  readStoreImpl = readStore,
  writeStoreImpl = writeStore
}) {
  const envKeys = envTokens.map((token, index) => ({
    id: `env-${index + 1}`,
    label: `env-${index + 1}`,
    hash: hashToken(token),
    source: 'env',
    revoked_at: null
  }));
  const pendingUsage = new Map();
  let cachedStorePromise;
  let mutationQueue = Promise.resolve();
  let usageFlushPromise;
  let usageFlushTimer;

  async function getStore() {
    if (!cachedStorePromise) {
      cachedStorePromise = readStoreImpl(keysFile);
    }
    return cachedStorePromise;
  }

  function queueMutation(mutator) {
    const operation = mutationQueue.then(async () => {
      const currentStore = await getStore();
      const nextStore = cloneStore(currentStore);
      const result = mutator(nextStore);
      await writeStoreImpl(keysFile, nextStore);
      cachedStorePromise = Promise.resolve(nextStore);
      return result;
    });
    mutationQueue = operation.catch(() => {});
    return operation;
  }

  async function listKeys() {
    await mutationQueue;
    const store = await getStore();
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

  async function createKey({ label, notes = '' }) {
    const normalizedLabel = String(label || '').trim();
    if (!normalizedLabel) {
      throw new Error('Client key label is required.');
    }

    const token = generateToken();
    const now = new Date().toISOString();
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
    await queueMutation((store) => store.keys.push(key));

    return {
      token,
      key: redactStoredKey(key)
    };
  }

  async function revokeKey(id) {
    return queueMutation((store) => {
      const key = store.keys.find((candidate) => candidate.id === id);
      if (!key) {
        return false;
      }
      if (!key.revoked_at) {
        key.revoked_at = new Date().toISOString();
      }
      return true;
    });
  }

  async function verifyToken(token) {
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

    const store = await getStore();
    const key = store.keys.find(
      (candidate) => !candidate.revoked_at && safeEqual(candidate.hash, tokenHash)
    );
    if (!key) {
      return undefined;
    }

    const lastUsedAt = new Date().toISOString();
    key.last_used_at = lastUsedAt;
    scheduleUsageUpdate(key.id, lastUsedAt);

    return {
      id: key.id,
      label: key.label,
      source: 'file'
    };
  }

  function scheduleUsageUpdate(id, lastUsedAt) {
    pendingUsage.set(id, lastUsedAt);
    if (usageFlushTimer) {
      return;
    }
    usageFlushTimer = setTimeout(() => {
      usageFlushTimer = undefined;
      void flushUsageUpdates();
    }, usageFlushDelayMs);
    usageFlushTimer.unref?.();
  }

  async function flushUsageUpdates() {
    if (usageFlushTimer) {
      clearTimeout(usageFlushTimer);
      usageFlushTimer = undefined;
    }
    if (!usageFlushPromise && pendingUsage.size > 0) {
      const updates = new Map(pendingUsage);
      pendingUsage.clear();
      usageFlushPromise = persistUsageUpdates(updates).finally(() => {
        usageFlushPromise = undefined;
      });
    }
    if (!usageFlushPromise) {
      return true;
    }

    const currentResult = await usageFlushPromise;
    if (pendingUsage.size > 0) {
      const nextResult = await flushUsageUpdates();
      return currentResult && nextResult;
    }
    return currentResult;
  }

  async function persistUsageUpdates(updates) {
    try {
      await queueMutation((store) => {
        for (const [id, lastUsedAt] of updates) {
          const key = store.keys.find((candidate) => candidate.id === id);
          if (key && !key.revoked_at) {
            key.last_used_at = lastUsedAt;
          }
        }
      });
      return true;
    } catch (error) {
      onUsagePersistenceError(error);
      return false;
    }
  }

  return {
    createKey,
    flushUsageUpdates,
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

async function inspectClientKeyStore(keysFile) {
  try {
    const store = await readStore(keysFile);
    return {
      ok: store.keys.some((key) => !key.revoked_at),
      activeKeys: store.keys.filter((key) => !key.revoked_at).length
    };
  } catch (error) {
    return {
      ok: false,
      activeKeys: 0,
      error
    };
  }
}

async function readStore(keysFile) {
  if (!keysFile) {
    return { keys: [] };
  }

  let content;
  try {
    content = await fs.readFile(keysFile, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { keys: [] };
    }
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error('Client key store is not valid JSON.', { cause: error });
  }
  if (!parsed || !Array.isArray(parsed.keys)) {
    throw new Error('Client key store must contain a keys array.');
  }
  for (const key of parsed.keys) {
    if (!isValidStoredKey(key)) {
      throw new Error('Client key store contains an invalid key record.');
    }
  }
  return parsed;
}

async function writeStore(keysFile, store) {
  if (!keysFile) {
    throw new Error('CLIENT_KEYS_FILE is not configured.');
  }
  await fs.mkdir(path.dirname(keysFile), { recursive: true, mode: 0o700 });
  const tempPath = `${keysFile}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(tempPath, keysFile);
    await fs.chmod(keysFile, 0o600);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

function isValidStoredKey(key) {
  return Boolean(
    key &&
      typeof key === 'object' &&
      String(key.id || '').trim() &&
      STORED_HASH_PATTERN.test(String(key.hash || ''))
  );
}

function cloneStore(store) {
  return {
    ...store,
    keys: store.keys.map((key) => ({ ...key }))
  };
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
  hashToken,
  inspectClientKeyStore
};
