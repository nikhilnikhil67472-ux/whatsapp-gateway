import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  BufferJSON,
  initAuthCreds,
} from '@whiskeysockets/baileys';

test('legacy multi-file auth is fully migrated, encrypted, and removable', async () => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wag-auth-migration-'));
  const instanceId = 'legacy-instance';
  const sessionDirectory = path.join(testRoot, 'sessions', instanceId);
  fs.mkdirSync(sessionDirectory, { recursive: true });

  process.env.SQLITE_DB_PATH = path.join(testRoot, 'gateway.db');
  process.env.WHATSAPP_SESSION_ROOT = path.join(testRoot, 'sessions');
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
  process.env.BAILEYS_DELETE_LEGACY_AUTH_AFTER_MIGRATION = 'true';

  fs.writeFileSync(
    path.join(sessionDirectory, 'creds.json'),
    JSON.stringify(initAuthCreds(), BufferJSON.replacer),
  );
  fs.writeFileSync(
    path.join(sessionDirectory, 'sender-key-group__a-b.json'),
    JSON.stringify(Uint8Array.from([1, 2, 3]), BufferJSON.replacer),
  );

  const [{ createSqliteAuthState }, { db }] = await Promise.all([
    import('./session-store'),
    import('../db/sqlite'),
  ]);
  const auth = await createSqliteAuthState(instanceId);
  const key = await auth.state.keys.get('sender-key', ['group/a:b']);
  const storedCreds = db.getAuthCreds(instanceId);
  const storedKeys = db.listAuthKeys(instanceId);

  assert.deepEqual([...key['group/a:b']], [1, 2, 3]);
  assert.match(storedCreds || '', /^wag-encrypted:v1:/);
  assert.ok(storedKeys.length >= 1);
  assert.ok(storedKeys.every((row) => row.data.startsWith('wag-encrypted:v1:')));
  assert.equal(fs.existsSync(sessionDirectory), false);
});
