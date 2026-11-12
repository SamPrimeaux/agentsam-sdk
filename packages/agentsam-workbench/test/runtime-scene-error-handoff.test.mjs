import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

// This is a presentation integration guard. The runtime's actual state
// transitions are covered by local-studio-runtime.test.ts.
test('a failed runtime field stops animating and yields to conversation recovery', async () => {
  const source = await readFile(
    new URL('../src/agent/AgentRuntimeField.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /if \(scene\.status === 'error'\) \{[\s\S]*?renderer\.suspend\(\);[\s\S]*?return;/);
  assert.match(source, /scene\.status !== 'error' &&/);
  assert.match(source, /pointerEvents: blocking && active \? 'auto' : 'none'/);
  assert.doesNotMatch(source, /scene\.status === 'waiting' \|\|\s*scene\.status === 'error'/);
});
