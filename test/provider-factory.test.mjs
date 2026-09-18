import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderAdapter } from '../src/providers/index.js';

function response(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return headers[String(name).toLowerCase()] || null; } },
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

test('OpenAI-compatible adapter accepts provider-discovered records and preserves cache key', async () => {
  let body;
  const record = {
    model_key: 'openai:account-model',
    provider: 'openai',
    provider_model_id: 'account-model',
    context_window: 128000,
    max_output_tokens: 8192,
    reasoning_efforts: ['auto'],
    service_tiers: ['default'],
    capabilities: { responses: true },
    pricing: null,
  };
  const provider = createProviderAdapter({
    modelRecord: record,
    credential: { value: 'key' },
    fetchImpl: async (url, init) => {
      assert.match(url, /\/v1\/responses$/);
      body = JSON.parse(init.body);
      return response({
        id: 'resp_1',
        status: 'completed',
        output_text: 'hello',
        output: [],
        usage: { input_tokens: 12, output_tokens: 3, input_tokens_details: { cached_tokens: 5 } },
      });
    },
  });
  const result = await provider.create({
    model: record.provider_model_id,
    modelRecord: record,
    input: 'hi',
    reasoningEffort: 'auto',
    serviceTier: 'default',
    promptCacheKey: 'session-1',
  });
  assert.equal(body.prompt_cache_key, 'session-1');
  assert.equal(body.reasoning, undefined);
  assert.equal(result.output_text, 'hello');
  assert.equal(result.provider_state.previous_response_id, 'resp_1');
  assert.equal(result.usage_snapshot.current_context.window_tokens, 128000);
});



test('xAI adapter supports native compaction without requiring a live API key in tests', async () => {
  const requests = [];
  const record = {
    model_key: 'grok:grok-test',
    provider: 'grok',
    provider_model_id: 'grok-test',
    context_window: 256000,
    max_output_tokens: 8192,
    reasoning_efforts: ['auto'],
    service_tiers: ['default'],
    capabilities: { responses: true, compaction: true, prompt_caching: true },
    pricing: null,
  };
  const provider = createProviderAdapter({
    modelRecord: record,
    credential: { value: 'xai-key' },
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      requests.push({ url, body });
      if (url.endsWith('/responses/compact')) {
        return response({
          id: 'cmp_1',
          object: 'response.compaction',
          output: [{ type: 'compaction', id: 'cmp_1', encrypted_content: 'opaque' }],
          usage: { input_tokens: 1000, output_tokens: 120, input_tokens_details: { cached_tokens: 0 } },
        });
      }
      return response({
        id: 'resp_xai_1',
        status: 'completed',
        output_text: 'first answer',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'first answer' }] }],
        usage: { input_tokens: 50, output_tokens: 10, input_tokens_details: { cached_tokens: 20 } },
      });
    },
  });

  const first = await provider.create({
    modelRecord: record,
    input: 'hello',
    instructions: 'stable system prefix',
    promptCacheKey: 'session-xai',
  });
  assert.equal(first.provider_state.previous_response_id, 'resp_xai_1');
  assert.equal(Array.isArray(first.provider_state.compaction_input), true);
  assert.equal(first.provider_state.compaction_input[0].role, 'system');

  const compacted = await provider.compact({
    modelRecord: record,
    providerState: first.provider_state,
    tokensBefore: 1000,
  });
  assert.match(requests.at(-1).url, /\/v1\/responses\/compact$/);
  assert.equal(Array.isArray(requests.at(-1).body.input), true);
  assert.equal(requests.at(-1).body.previous_response_id, undefined);
  assert.deepEqual(compacted.provider_state.compaction_input, [
    { type: 'compaction', id: 'cmp_1', encrypted_content: 'opaque' },
  ]);
  assert.equal(compacted.provider_state.previous_response_id, null);

  await provider.create({
    modelRecord: record,
    providerState: compacted.provider_state,
    input: 'continue after compaction',
    promptCacheKey: 'session-xai',
  });
  assert.deepEqual(requests.at(-1).body.input, [
    { type: 'compaction', id: 'cmp_1', encrypted_content: 'opaque' },
    { role: 'user', content: 'continue after compaction' },
  ]);
});


test('Anthropic adapter keeps append-only provider state and tool calls', async () => {
  const record = {
    model_key: 'anthropic:claude-test', provider: 'anthropic', provider_model_id: 'claude-test',
    context_window: 200000, max_output_tokens: 4096, reasoning_efforts: ['auto'], service_tiers: ['default'], pricing: null,
  };
  const provider = createProviderAdapter({
    modelRecord: record,
    credential: { value: 'key' },
    fetchImpl: async () => response({
      id: 'msg_1', stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'as_test', input: { a: 1 } }],
      usage: { input_tokens: 20, output_tokens: 5, cache_read_input_tokens: 7 },
    }),
  });
  const result = await provider.create({
    modelRecord: record,
    input: 'do it',
    instructions: 'stable prefix',
    tools: [{ type: 'function', name: 'as_test', description: 'test', parameters: { type: 'object', properties: {} } }],
  });
  assert.equal(result.tool_calls[0].call_id, 'toolu_1');
  assert.equal(result.provider_state.messages.at(-1).role, 'assistant');
  assert.equal(result.usage_snapshot.cumulative.cached_input_tokens, 7);
});

test('Gemini adapter maps provider token limits and function calls into AgentSam shape', async () => {
  const record = {
    model_key: 'gemini:gemini-test', provider: 'gemini', provider_model_id: 'gemini-test',
    context_window: 1000000, max_output_tokens: 8192, reasoning_efforts: ['auto'], service_tiers: ['default'], pricing: null,
  };
  const provider = createProviderAdapter({
    modelRecord: record,
    credential: { value: 'key' },
    fetchImpl: async () => response({
      responseId: 'gem_1',
      candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ functionCall: { name: 'as_test', args: { x: 2 } } }] } }],
      usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 8, cachedContentTokenCount: 10, thoughtsTokenCount: 2 },
    }),
  });
  const result = await provider.create({ modelRecord: record, input: 'go', tools: [{ type: 'function', name: 'as_test', parameters: { type: 'object' } }] });
  assert.equal(result.tool_calls[0].name, 'as_test');
  assert.equal(result.usage_snapshot.current_context.window_tokens, 1000000);
  assert.equal(result.usage_snapshot.cumulative.reasoning_tokens, 2);
});

test('Cloudflare adapter executes account-scoped Workers AI through the connected account', async () => {
  let seen;
  const record = {
    model_key: 'cloudflare:@cf/test/model', provider: 'cloudflare', provider_model_id: '@cf/test/model',
    context_window: null, max_output_tokens: null, reasoning_efforts: ['auto'], service_tiers: ['default'], pricing: null,
  };
  const provider = createProviderAdapter({
    modelRecord: record,
    credential: { value: 'cf-token', account_id: '1234567890abcdef1234567890abcdef' },
    fetchImpl: async (url, init) => {
      seen = { url, headers: init.headers, body: JSON.parse(init.body) };
      return response({ id: 'cf_1', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'done' } }], usage: { prompt_tokens: 9, completion_tokens: 2 } });
    },
  });
  const result = await provider.create({ modelRecord: record, input: 'go' });
  assert.match(seen.url, /accounts\/1234567890abcdef1234567890abcdef\/ai\/v1\/chat\/completions$/);
  assert.equal(seen.headers['cf-aig-gateway-id'], 'default');
  assert.equal(seen.body.model, '@cf/test/model');
  assert.equal(result.output_text, 'done');
});
