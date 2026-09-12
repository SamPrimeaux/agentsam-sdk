import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { compactConsumedToolResult, rehydrateContextRef } from '../src/context/index.js';

const sha = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;

test('large consumed evidence can leave active context and later rehydrate by stable ref/hash', async () => {
  const source = 'important evidence '.repeat(800);
  const ref = 'tool:call_123';
  const digest = sha(source);
  const compacted = compactConsumedToolResult(source, { ref, hash: digest });
  assert.equal(compacted.compacted, true);
  assert.equal(compacted.chars, 4_000);
  assert.equal(compacted.source_chars, source.length);
  const adapter = { async read(requested) { assert.equal(requested, ref); return { content: source, hash: digest, kind: 'tool_result' }; } };
  const restored = await rehydrateContextRef(ref, adapter, { expectedHash: digest, kind: 'tool_result', maxChars: 64_000 });
  assert.equal(restored.content, source);
  assert.equal(restored.hash, digest);
  assert.equal(restored.truncated, false);
});

test('rehydration fails closed when stable source hash changed', async () => {
  await assert.rejects(() => rehydrateContextRef('file:x', async () => ({ content: 'changed' }), { expectedHash: sha('original') }), /rehydration_hash_mismatch/);
});
