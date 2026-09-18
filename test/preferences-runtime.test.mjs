import assert from 'node:assert/strict';
import test from 'node:test';
import { runtimeOptions } from '../src/commands/preferences.js';

test('standalone users only see local execution', () => {
  assert.deepEqual(runtimeOptions({ accountConnected: false }).map((row) => row.value), ['local']);
});

test('IAM-connected users can choose enrolled remote and sandbox lanes', () => {
  assert.deepEqual(runtimeOptions({ accountConnected: true }).map((row) => row.value), ['local', 'remote', 'sandbox']);
});
