import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertModelAvailableForProvider,
  collectCredentialScopedInventory,
  filterWorkersAiCurated,
  makeMapCredentialResolver,
  sanitizeInventoryForClient,
} from '../../src/models/inventory-core.js';

test('assertModelAvailableForProvider fails closed on mismatch', () => {
  assert.throws(
    () => assertModelAvailableForProvider({ availableModels: [{ provider: 'openai', model_id: 'gpt-x' }] }, 'openai', 'other'),
    /selected_model_not_available/,
  );
  const row = assertModelAvailableForProvider(
    { availableModels: [{ provider: 'openai', model_id: 'gpt-x', provider_model_id: 'gpt-x' }] },
    'openai',
    'gpt-x',
  );
  assert.equal(row.model_id, 'gpt-x');
});

test('vault-scoped inventory sanitizes secrets and discovers only injected providers', async () => {
  const status = await collectCredentialScopedInventory({
    credentialPlane: 'studio_vault',
    resolveCredential: makeMapCredentialResolver(new Map([
      ['openai', { value: 'sk-secret-should-not-leak', source: 'user_vault' }],
    ])),
    fetchImpl: async (url) => {
      if (String(url).includes('api.openai.com')) {
        return { ok: true, status: 200, async json() { return { data: [{ id: 'gpt-test' }] }; } };
      }
      throw new Error('unexpected ' + url);
    },
  });
  const safe = sanitizeInventoryForClient(status);
  const text = JSON.stringify(safe);
  assert.doesNotMatch(text, /sk-secret-should-not-leak/);
  assert.doesNotMatch(text, /"value"/);
  assert.equal(safe.credential_plane, 'studio_vault');
  assert.equal(safe.providers.find((p) => p.id === 'openai')?.source, 'user_vault');
  assert.deepEqual(safe.availableModels.map((m) => m.model_id), ['gpt-test']);
  assert.equal(safe.providers.find((p) => p.id === 'gemini')?.configured, false);
});

test('Workers AI curated filter intersects', () => {
  const rows = filterWorkersAiCurated([
    { provider_model_id: '@cf/qwen/qwen2.5-coder-32b-instruct' },
    { provider_model_id: '@cf/meta/llama-3.2-1b-instruct' },
  ]);
  assert.deepEqual(rows.map((r) => r.provider_model_id), ['@cf/qwen/qwen2.5-coder-32b-instruct']);
});
