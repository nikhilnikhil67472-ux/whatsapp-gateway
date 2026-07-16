import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

test('worker shutdown keeps instances restartable', () => {
  const source = fs.readFileSync(new URL('./manager.ts', import.meta.url), 'utf8');
  const shutdownBlock = source.slice(source.indexOf('static async shutdownAll'));

  assert.match(shutdownBlock, /status:\s*'disconnected'/);
  assert.doesNotMatch(shutdownBlock, /this\.stopInstance/);
});
