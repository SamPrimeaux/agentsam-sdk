import assert from 'node:assert/strict';
import test from 'node:test';
import { getToolCatalog } from '../src/lib/tools.js';
import { searchToolCards } from '../src/tools/index.js';
import { DEFAULT_RESULT_POLICY } from '../src/context/index.js';

test('every built-in SDK tool inherits a bounded result policy', () => {
  for (const lane of ['fullstack', 'cms', 'data', 'crm', 'creative']) {
    for (const tool of getToolCatalog(lane)) assert.deepEqual(tool.result_policy, DEFAULT_RESULT_POLICY);
  }
});

test('tools.search returns compact cards rather than full schemas', () => {
  const catalog = Array.from({ length: 20 }, (_, index) => ({
    name: index === 13 ? 'code.retrieve' : `tool.${index}`,
    description: index === 13 ? 'Find symbols, callers, and semantic code matches.' : `Capability ${index}`,
    category: index === 13 ? 'code' : 'misc',
    risk: 'read',
    input_schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, giant: { description: 'x'.repeat(5000) } } },
  }));
  const result = searchToolCards(catalog, 'code symbols');
  assert.ok(result.cards.length <= 8);
  assert.equal(result.cards[0].tool, 'code.retrieve');
  assert.deepEqual(result.cards[0].required, ['query']);
  assert.equal('input_schema' in result.cards[0], false);
  assert.ok(result.receipt.chars < 24_000);
});
