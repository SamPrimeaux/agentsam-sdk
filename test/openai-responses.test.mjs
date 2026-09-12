import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpenAIResponsesAdapter } from '../src/providers/index.js';

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

test('Responses adapter sends reasoning/service tier without legacy sampling parameters and reconciles provider usage', async () => {
  let request = null;
  const events = [];
  const adapter = createOpenAIResponsesAdapter({
    apiKey: 'test-key',
    emit: event => events.push(event),
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return jsonResponse({
        id: 'resp_test', status: 'completed', model: 'gpt-6-astra', service_tier: 'fast',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'done' }] }],
        usage: {
          input_tokens: 100_000,
          input_tokens_details: { cached_tokens: 80_000, cache_write_tokens: 10_000 },
          output_tokens: 5_000,
          output_tokens_details: { reasoning_tokens: 2_000 },
        },
      });
    },
  });
  const result = await adapter.create({ model: 'gpt-6-astra', input: 'work', reasoningEffort: 'high', serviceTier: 'fast' });
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.body.reasoning.effort, 'high');
  assert.equal(request.body.service_tier, 'fast');
  assert.equal(request.body.truncation, 'disabled');
  assert.equal('temperature' in request.body, false);
  assert.equal('top_p' in request.body, false);
  assert.equal(result.output_text, 'done');
  assert.equal(result.usage_snapshot.current_context.input_tokens, 100_000);
  assert.equal(result.usage_snapshot.current_context.window_tokens, 1_050_000);
  assert.equal(result.actual_service_tier, 'fast');
  assert.equal(result.cost.rates_per_million.input, 20);
  assert.deepEqual(events.map(event => event.type), ['model.started', 'usage.snapshot', 'cost.snapshot', 'model.completed']);
});

test('Responses adapter preserves function call_id when returning tool output', async () => {
  const bodies = [];
  const adapter = createOpenAIResponsesAdapter({
    apiKey: 'test-key',
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      bodies.push(body);
      if (bodies.length === 1) {
        return jsonResponse({
          id: 'resp_calls', status: 'completed', service_tier: 'default',
          output: [{ type: 'function_call', id: 'fc_1', call_id: 'call_abc', name: 'repository_snapshot', arguments: '{"depth":"quick"}', status: 'completed' }],
          usage: { input_tokens: 100, output_tokens: 20 },
        });
      }
      return jsonResponse({
        id: 'resp_done', status: 'completed', service_tier: 'default',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'complete' }] }],
        usage: { input_tokens: 200, output_tokens: 30 },
      });
    },
  });
  const first = await adapter.create({
    model: 'gpt-6-astra', input: 'inspect', reasoningEffort: 'low', serviceTier: 'default',
    tools: [{ type: 'function', name: 'repository_snapshot', description: 'Snapshot repo', parameters: { type: 'object', properties: {} } }],
  });
  assert.equal(first.tool_calls[0].call_id, 'call_abc');
  const second = await adapter.continueWithToolOutputs({
    model: 'gpt-6-astra', previousResponseId: first.response_id, reasoningEffort: 'low', serviceTier: 'default',
    toolOutputs: [{ call_id: first.tool_calls[0].call_id, output: { ok: true } }],
  });
  assert.equal(bodies[1].previous_response_id, 'resp_calls');
  assert.deepEqual(bodies[1].input, [{ type: 'function_call_output', call_id: 'call_abc', output: '{"ok":true}' }]);
  assert.equal(second.output_text, 'complete');
});

test('compaction is an explicit provider operation and has no arbitrary default wall-clock timeout', async () => {
  let signal = 'unset';
  let body = null;
  const adapter = createOpenAIResponsesAdapter({
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses/compact');
      signal = options.signal;
      body = JSON.parse(options.body);
      return jsonResponse({ id: 'cmp_1', object: 'response.compaction', output: [{ type: 'compaction', encrypted_content: 'opaque' }], usage: { input_tokens: 1_000, output_tokens: 100 } });
    },
  });
  const compacted = await adapter.compact({ model: 'gpt-6-astra', previousResponseId: 'resp_previous' });
  assert.equal(signal, undefined);
  assert.equal(body.previous_response_id, 'resp_previous');
  assert.equal(compacted.compaction_id, 'cmp_1');
});
