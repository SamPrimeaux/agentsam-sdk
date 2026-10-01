import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtimeEntry = new URL('../src/adapters/portable-d1/index.js', import.meta.url);

test('portable D1 runtime entry does not pull Node-only migration loaders into Workers', () => {
  const source = readFileSync(runtimeEntry, 'utf8');
  assert.doesNotMatch(source, /migrations\/apply-portable/);
  assert.doesNotMatch(source, /node:(?:fs|path|url)/);
});
