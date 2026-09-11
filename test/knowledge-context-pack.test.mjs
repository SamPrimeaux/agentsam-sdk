import assert from 'node:assert/strict';
import test from 'node:test';
import { createContextPack } from '../src/knowledge/context-pack.js';

test('knowledge ContextPack includes a measurable selection receipt', () => {
  const pack = createContextPack({
    queryId: 'q1',
    query: { text: 'where is auth?', top_k: 2, token_budget: 2000 },
    hits: [{ ref: 'file:a', content: 'abcd' }, { ref: 'file:b', content: '12345678' }],
    diagnostics: { sources_considered: 7, sources_deferred: 5 },
  });
  assert.deepEqual(pack.receipt, {
    chars: 12,
    estimated_tokens: 3,
    sources_considered: 7,
    sources_included: 2,
    sources_deferred: 5,
  });
});
