const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createClientKeyManager } = require('../src/auth/clientKeys');

test('verifies env tokens without writing a key store', () => {
  const keyManager = createClientKeyManager({
    envTokens: ['env-secret'],
    keysFile: path.join(os.tmpdir(), 'missing-client-keys.json')
  });

  assert.equal(keyManager.verifyToken('env-secret').id, 'env-1');
  assert.equal(keyManager.verifyToken('wrong'), undefined);
});

test('creates, verifies, lists, and revokes stored client keys', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-to-text-keys-'));
  const keysFile = path.join(dir, 'client-keys.json');
  const keyManager = createClientKeyManager({ envTokens: [], keysFile });

  const created = keyManager.createKey({ label: 'talktome-test', notes: 'integration test' });
  assert.match(created.token, /^stt_/);
  assert.equal(created.key.label, 'talktome-test');
  assert.equal(created.key.revoked_at, null);

  const verified = keyManager.verifyToken(created.token);
  assert.equal(verified.id, created.key.id);

  const listed = keyManager.listKeys();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].label, 'talktome-test');
  assert.equal(Object.hasOwn(listed[0], 'hash'), false);
  assert.ok(listed[0].last_used_at);

  assert.equal(keyManager.revokeKey(created.key.id), true);
  assert.equal(keyManager.verifyToken(created.token), undefined);
});
