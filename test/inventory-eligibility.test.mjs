import test from 'node:test';
import assert from 'node:assert/strict';

import { discoverOpenAIModels, discoverGeminiModels, discoverCursorModels } from '../src/models/discovery.js';
import { sanitizeInventoryForClient } from '../src/models/inventory-core.js';

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function sanitized(models) {
  return sanitizeInventoryForClient({
    providers: [],
    discovery: {},
    availableModels: models,
  }).availableModels;
}

test('known OpenAI Responses reference is selectable while unknown live models stay visible', async () => {
  const result = await discoverOpenAIModels('user-key', async () => json({
    data: [{ id: 'gpt-5.6-sol' }, { id: 'brand-new-unclassified-model' }],
  }));
  const rows = sanitized(result.models);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.model_id === 'gpt-5.6-sol')?.chat_eligible, true);
  const unknown = rows.find((row) => row.model_id === 'brand-new-unclassified-model');
  assert.equal(unknown?.chat_eligible, false);
  assert.equal(unknown?.eligibility_reason, 'capability_unknown');
});

test('Cursor inventory is preserved but reports adapter unavailability', async () => {
  const result = await discoverCursorModels('cursor-key', async () => json({
    items: [{ id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', parameters: [] }],
  }));
  const [row] = sanitized(result.models);
  assert.equal(row.provider, 'cursor');
  assert.equal(row.model_id, 'gpt-5.6-sol');
  assert.equal(row.chat_eligible, false);
  assert.equal(row.eligibility_reason, 'provider_adapter_unavailable');
});

test('Gemini provider description keeps TTS visible outside the chat picker', async () => {
  const result = await discoverGeminiModels('gemini-key', async () => json({
    models: [{
      name: 'models/gemini-tts-fixture',
      baseModelId: 'gemini-tts-fixture',
      displayName: 'Voice fixture',
      description: 'Preview Text-to-Speech model',
      supportedGenerationMethods: ['generateContent'],
      inputTokenLimit: 8192,
      outputTokenLimit: 8192,
    }],
  }));
  const [row] = sanitized(result.models);
  assert.equal(row.model_id, 'gemini-tts-fixture');
  assert.equal(row.chat_eligible, false);
  assert.equal(row.eligibility_reason, 'specialized_output_model');
  assert.equal(row.eligibility_source, 'provider_api');
});
