import assert from 'node:assert/strict';
import test from 'node:test';
import {
  legacyAuthFileName,
  parseLegacyAuthKeyFile,
} from './legacy-auth';

test('legacy auth filenames use the same sanitization as Baileys', () => {
  assert.equal(
    legacyAuthFileName('sender-key', 'group/a:b'),
    'sender-key-group__a-b.json',
  );
});
test('legacy auth filenames are parsed with longest key type first', () => {
  assert.deepEqual(
    parseLegacyAuthKeyFile('sender-key-memory-contact.json'),
    {
      keyType: 'sender-key-memory',
      keyId: 'contact',
    },
  );
  assert.deepEqual(
    parseLegacyAuthKeyFile('app-state-sync-version-regular.json'),
    {
      keyType: 'app-state-sync-version',
      keyId: 'regular',
    },
  );
});

test('credential and unknown files are not parsed as signal keys', () => {
  assert.equal(parseLegacyAuthKeyFile('creds.json'), null);
  assert.equal(parseLegacyAuthKeyFile('unknown-key.json'), null);
  assert.equal(parseLegacyAuthKeyFile('pre-key-.json'), null);
});
