import test from 'node:test';
import assert from 'node:assert/strict';
import { executeLocalProviderBridge } from '../../packages/agentsam-desktop-shell/scripts/local-provider-bridge.mjs';

const CANARY = 'sk-test-CANARY-123456';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function openAiFetch(url, init = {}) {
  assert.equal(init.headers?.authorization, `Bearer ${CANARY}`);
  if (String(url).endsWith('/v1/models')) {
    return Promise.resolve(json({ data: [{ id: 'gpt-5.6-sol', object: 'model' }] }));
  }
  if (String(url).endsWith('/v1/responses')) {
    return Promise.resolve(json({
      id: 'resp_local_fixture',
      status: 'completed',
      output_text: 'offline bridge works',
      output: [],
      usage: { input_tokens: 3, output_tokens: 4 },
    }));
  }
  throw new Error(`unexpected_url:${url}`);
}

test('device OpenAI credential discovers live inventory without leaking the key', async () => {
  const result = await executeLocalProviderBridge({
    operation: 'inventory',
    credentials: { openai: CANARY },
  }, { fetchImpl: openAiFetch });
  assert.equal(result.ok, true);
  assert.equal(result.credential_plane, 'device_keychain');
  assert.equal(result.providers.find((row) => row.id === 'openai')?.configured, true);
  assert.equal(result.availableModels.some((row) => row.provider === 'openai' && row.model_id === 'gpt-5.6-sol'), true);
  assert.equal(JSON.stringify(result).includes(CANARY), false);
});

test('device OpenAI credential chats through canonical Responses adapter without leaking the key', async () => {
  const result = await executeLocalProviderBridge({
    operation: 'chat',
    provider: 'openai',
    model_id: 'gpt-5.6-sol',
    messages: [{ role: 'user', content: 'hello' }],
    credentials: { openai: CANARY },
  }, { fetchImpl: openAiFetch });
  assert.deepEqual(result, {
    ok: true,
    provider: 'openai',
    model_id: 'gpt-5.6-sol',
    text: 'offline bridge works',
  });
  assert.equal(JSON.stringify(result).includes(CANARY), false);
});

test('provider rejection is sanitized and never echoes credential material', async () => {
  const result = await executeLocalProviderBridge({
    operation: 'inventory',
    credentials: { openai: CANARY },
  }, {
    fetchImpl: async () => json({ error: { message: `bad ${CANARY}` } }, 401),
  });
  assert.equal(JSON.stringify(result).includes(CANARY), false);
});
