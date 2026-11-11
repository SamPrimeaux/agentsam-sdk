import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { discoverMetaModels } from '../../protocol/models/discovery.mjs';
import {
  collectCredentialScopedInventory,
  resolveDiscoveredModelExecution,
  sanitizeInventoryForClient,
} from '../../src/models/inventory-core.js';

const modelRows = [
  { id: 'muse-spark-1.3' },
  { id: 'muse-spark-1.3-contributor' },
  { id: 'muse-image-1.0' },
];
const fakeFetch = async (url, options) => {
  assert.equal(url, 'https://api.meta.ai/v1/models');
  assert.equal(options.headers.authorization, 'Bearer credential-from-account-vault');
  return { ok: true, json: async () => ({ data: modelRows }) };
};

describe('Meta Model API through shared credential-scoped inventory', () => {
  it('discovers only models enabled for this API key', async () => {
    const discovered = await discoverMetaModels('credential-from-account-vault', fakeFetch);
    assert.equal(discovered.ok, true);
    assert.equal(discovered.models.length, 3);
    assert.equal(discovered.models[0].model_key, 'meta:muse-spark-1.3');
    assert.equal(discovered.models[2].capabilities.chat_completions, false);
  });

  it('shares one verified reasoning contract across Settings and model dispatch', async () => {
    const raw = await collectCredentialScopedInventory({
      resolveCredential: async providerId => providerId === 'meta'
        ? { configured: true, value: 'credential-from-account-vault', source: 'user_vault' }
        : { configured: false, value: '', source: null },
      fetchImpl: fakeFetch,
    });
    const inventory = sanitizeInventoryForClient(raw);
    assert.equal(inventory.availableModels.length, 3);
    assert.equal(inventory.availableModels[0].chat_eligible, true);
    assert.equal(inventory.availableModels[2].chat_eligible, false);
    const selected = resolveDiscoveredModelExecution(inventory, 'meta', 'muse-spark-1.3', { reasoningEffort: 'max' });
    assert.equal(selected.reasoning_effort, 'max');
    assert.equal(selected.capability_source, 'provider_documentation_and_credential_discovery');
    assert.equal(resolveDiscoveredModelExecution(inventory, 'meta', 'muse-spark-1.3').reasoning_effort, null);
    assert.throws(
      () => resolveDiscoveredModelExecution(inventory, 'meta', 'muse-spark-1.3', { reasoningEffort: 'none' }),
      /reasoning_effort_not_verified_for_model/,
    );
    assert.throws(
      () => resolveDiscoveredModelExecution(inventory, 'meta', 'muse-spark-1.3-contributor', { reasoningEffort: 'max' }),
      /reasoning_effort_not_verified_for_model/,
    );
    assert.throws(
      () => resolveDiscoveredModelExecution(inventory, 'meta', 'muse-image-1.0'),
      /selected_model_not_chat_eligible/,
    );
    assert.throws(
      () => resolveDiscoveredModelExecution(inventory, 'openai', 'muse-spark-1.3'),
      /selected_model_not_available_for_credential/,
    );
  });

  it('does not discover anything without an account credential', async () => {
    const result = await discoverMetaModels('', fakeFetch);
    assert.equal(result.attempted, false);
    assert.equal(result.ok, false);
  });
});
