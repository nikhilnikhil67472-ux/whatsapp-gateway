import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

test('worker shutdown keeps instances restartable', () => {
  const source = fs.readFileSync(new URL('./manager.ts', import.meta.url), 'utf8');
  const shutdownBlock = source.slice(source.indexOf('static async shutdownAll'));

  assert.match(shutdownBlock, /status:\s*'disconnected'/);
  assert.doesNotMatch(shutdownBlock, /this\.stopInstance/);
});

test('a stale socket cannot release the replacement socket lease', () => {
  const source = fs.readFileSync(new URL('./manager.ts', import.meta.url), 'utf8');
  const closeHandler = source.slice(
    source.indexOf("if (connection !== 'close') return"),
    source.indexOf('if (!reconnect)', source.indexOf("if (connection !== 'close') return")),
  );

  assert.match(
    closeHandler,
    /if \(engineState\.leases\.get\(instanceId\) === lease\)/,
  );
  assert.match(closeHandler, /await lease\.release\(\)/);
});
