const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { hashToken } = require('../src/auth/clientKeys');
const { DEFAULTS, getReadiness, parseConfig } = require('../src/config');

test('uses the systemd-writable client key store by default', () => {
  assert.equal(DEFAULTS.CLIENT_KEYS_FILE, '/var/lib/speech-to-text/client-keys.json');
  assert.equal(parseConfig({}).clientKeysFile, '/var/lib/speech-to-text/client-keys.json');
});

test('rejects integer configuration values with trailing characters', () => {
  assert.throws(() => parseConfig({ PORT: '7077garbage' }), /PORT must be an integer/);
  assert.throws(
    () => parseConfig({ MAX_AUDIO_BYTES: '26214400bytes' }),
    /MAX_AUDIO_BYTES must be an integer/
  );
  assert.throws(
    () => parseConfig({ REQUEST_TIMEOUT_MS: '120000ms' }),
    /REQUEST_TIMEOUT_MS must be an integer/
  );
});

test('readiness requires a valid key store with an active key', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-to-text-readiness-'));
  const keysFile = path.join(dir, 'client-keys.json');
  const config = {
    openaiApiKey: 'sk-test',
    clientApiKeys: [],
    clientKeysFile: keysFile,
    adminApiToken: 'admin-token'
  };

  let readiness = await getReadiness(config);
  assert.equal(readiness.ok, false);
  assert.equal(readiness.missing[0].code, 'missing_client_keys');

  fs.writeFileSync(keysFile, '{not-json}\n');
  readiness = await getReadiness(config);
  assert.equal(readiness.ok, false);
  assert.equal(readiness.missing[0].code, 'invalid_client_keys');

  fs.writeFileSync(
    keysFile,
    JSON.stringify({
      keys: [
        {
          id: 'key_test',
          hash: hashToken('test-token'),
          revoked_at: new Date().toISOString()
        }
      ]
    })
  );
  readiness = await getReadiness(config);
  assert.equal(readiness.ok, false);
  assert.equal(readiness.missing[0].code, 'missing_client_keys');

  fs.writeFileSync(
    keysFile,
    JSON.stringify({
      keys: [{ id: 'key_test', hash: hashToken('test-token'), revoked_at: null }]
    })
  );
  readiness = await getReadiness(config);
  assert.equal(readiness.ok, true);
});
