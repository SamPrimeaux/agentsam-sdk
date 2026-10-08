import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig } from '../../src/knowledge/config.js';
import { retrieve } from '../../src/knowledge/engine.js';

test('active retrieval refuses an older generation from a broader or different source scope', async () => {
  const config = defaultConfig({ repositoryId: 'customer-repository', include: ['current-folder'], scope: 'code' });
  const olderConfig = { ...config, scope: { name: 'code', include: ['all-old-files'], exclude: [] } };
  const saved = { id: 'old-generation', config: olderConfig, chunks: [{ id: '1', path: 'all-old-files/private.ts', content: 'secret old code', ordinal: 0 }], symbols: [], files: [], edges: [] };
  const store = { active: async () => saved };
  await assert.rejects(retrieve({ store, config, text: 'old code', topK: 1, tokenBudget: 512 }), /knowledge_generation_config_mismatch/);
});

test('active retrieval refuses generations built with an older chunk policy', async () => {
  const config = defaultConfig({ repositoryId: 'customer-repository', include: ['.'], scope: 'code' });
  const saved = { id: 'older-policy', config: { ...config, chunking: { max_chars: 1000 } }, chunks: [], files: [], symbols: [], edges: [] };
  await assert.rejects(retrieve({ store: { active: async () => saved }, config, text: 'anywhere', topK: 1, tokenBudget: 512 }), /knowledge_generation_config_mismatch/);
});
