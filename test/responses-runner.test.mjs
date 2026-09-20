import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createCapabilityAdapter } from '../src/agent/capability-adapter.js';
import { buildAgentToolSurface, capabilityFunctionName, runResponsesAgent } from '../src/agent/responses-runner.js';

function usage(input = 10_000, cumulative = input) {
  return {
    current_context: { input_tokens: input, window_tokens: 1_050_000 },
    cumulative: { input_tokens: cumulative, output_tokens: 100, cached_input_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0 },
    estimate_kind: 'provider', provider_authoritative: true,
  };
}
function cost(total = 0.1) { return { total_usd: total, components_usd: { input: total * 0.5, cached_input: total * 0.1, cache_write: total * 0.1, output: total * 0.3 } }; }

test('capability adapter hydrates packaged JSON schemas and tool surface exposes only selected executable schemas', () => {
  const adapter = createCapabilityAdapter();
  const descriptors = adapter.toolDescriptors();
  assert.deepEqual(descriptors.map((row) => row.name).sort(), ['cloudflare.cpu.profile', 'cloudflare.wrangler.native', 'knowledge.search', 'repository.snapshot', 'terminal.exec']);
  const repository = descriptors.find((row) => row.name === 'repository.snapshot');
  assert.equal(repository.input_schema.type, 'object');
  assert.ok(repository.input_schema.properties.cwd);
  const surface = buildAgentToolSurface(adapter, 'snapshot inspect repository');
  assert.ok(surface.tools.some((t) => t.name === capabilityFunctionName('repository.snapshot')));
  assert.equal(surface.tools[0].parameters.type, 'object');
  assert.equal(surface.receipt.catalog_tools, 5);
});

test('runner owns cwd, executes selected tool, preserves call_id and returns provider-authoritative continuation', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-runner-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"runner-demo"}');
  let invoked = null;
  const capabilityAdapter = createCapabilityAdapter({
    handlers: {
      'repository.snapshot': async input => {
        invoked = input;
        return { ok: true, cwd: input.cwd, evidence: 'x'.repeat(500) };
      },
    },
  });
  const provider = {
    async create(params) {
      assert.equal(params.model, 'gpt-6-astra');
      assert.equal(params.reasoningEffort, 'high');
      assert.equal(params.serviceTier, 'fast');
      assert.ok(params.tools.some((t) => t.name === capabilityFunctionName('repository.snapshot')));
      return {
        response_id: 'resp_1', output_text: '', actual_service_tier: 'fast',
        tool_calls: [{ call_id: 'call_1', name: capabilityFunctionName('repository.snapshot'), arguments: '{"cwd":"/tmp/attacker","churnDays":7}' }],
        usage_snapshot: usage(20_000), cost: cost(0.2),
      };
    },
    async continueWithToolOutputs(params) {
      assert.equal(params.previousResponseId, 'resp_1');
      assert.equal(params.toolOutputs[0].call_id, 'call_1');
      assert.match(params.toolOutputs[0].output, /runner-demo|runner-/);
      return { response_id: 'resp_2', output_text: 'done', actual_service_tier: 'fast', tool_calls: [], usage_snapshot: usage(21_000, 41_000), cost: cost(0.3) };
    },
    async compact() { throw new Error('should_not_compact'); },
  };
  const events = [];
  const result = await runResponsesAgent({
    provider, capabilityAdapter, cwd: root, prompt: 'snapshot inspect repository', model: 'gpt-6-astra', reasoningEffort: 'high', serviceTier: 'fast',
    emit: event => events.push(event),
  });
  assert.equal(invoked.cwd, root);
  assert.equal(invoked.churnDays, 7);
  assert.equal(result.output_text, 'done');
  assert.equal(result.response_id, 'resp_2');
  assert.equal(result.total_cost_usd, 0.5);
  assert.equal(result.cost_breakdown_usd.input, 0.25);
  assert.equal(result.cost_breakdown_usd.output, 0.15);
  assert.equal(result.continuation.compact_before_next_turn, false);
  assert.ok(events.some(event => event.type === 'tool.search'));
  assert.ok(events.some(event => event.type === 'tool.completed'));
});

test('runtime approval hook can deny a model-triggered tool before execution', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-runner-denied-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"denied-demo"}');
  let invoked = false;
  const capabilityAdapter = createCapabilityAdapter({
    handlers: {
      'repository.snapshot': async () => { invoked = true; return { ok: true }; },
    },
  });
  const provider = {
    async create() {
      return {
        response_id: 'resp_deny', output_text: '', actual_service_tier: 'default',
        tool_calls: [{ call_id: 'call_deny', name: capabilityFunctionName('repository.snapshot'), arguments: '{}' }],
        usage_snapshot: usage(10_000), cost: cost(0.01),
      };
    },
    async continueWithToolOutputs() { throw new Error('continuation_should_not_run'); },
  };
  await assert.rejects(() => runResponsesAgent({
    provider, capabilityAdapter, cwd: root, prompt: 'snapshot repository', model: 'gpt-6-astra', reasoningEffort: 'low', serviceTier: 'default',
    beforeTool: async request => {
      assert.equal(request.capability_id, 'repository.snapshot');
      assert.equal(request.cwd, root);
      return false;
    },
  }), /tool_execution_not_approved:repository\.snapshot/);
  assert.equal(invoked, false);
});

test('runner compacts before a projected high-context continuation rather than crossing normal policy blindly', async () => {
  let compactCalls = 0;
  let createInput = null;
  const capabilityAdapter = createCapabilityAdapter();
  const provider = {
    async compact(params) {
      compactCalls += 1;
      assert.equal(params.previousResponseId, 'resp_old');
      return { output: [{ type: 'compaction', encrypted_content: 'opaque-small' }] };
    },
    async create(params) {
      createInput = params.input;
      assert.equal(params.previousResponseId, undefined);
      return { response_id: 'resp_new', output_text: 'ok', actual_service_tier: 'default', tool_calls: [], usage_snapshot: usage(30_000), cost: cost(0.1) };
    },
    async continueWithToolOutputs() { throw new Error('unused'); },
  };
  const result = await runResponsesAgent({
    provider, capabilityAdapter, cwd: process.cwd(), prompt: 'continue repository work', model: 'gpt-6-astra', reasoningEffort: 'low', serviceTier: 'default',
    previousResponseId: 'resp_old', previousUsageSnapshot: usage(179_500),
  });
  assert.equal(compactCalls, 1);
  assert.ok(Array.isArray(createInput));
  assert.equal(createInput[0].type, 'compaction');
  assert.equal(result.compacted_before_turn, true);
});

test('runner refuses an oversized initial context and supports an explicit projected call-cost ceiling', async () => {
  const capabilityAdapter = createCapabilityAdapter();
  const provider = { async create() { throw new Error('provider_should_not_run'); }, async continueWithToolOutputs() {}, async compact() {} };
  await assert.rejects(() => runResponsesAgent({
    provider, capabilityAdapter, cwd: process.cwd(), prompt: 'x'.repeat(800_000), model: 'gpt-6-astra', reasoningEffort: 'low', serviceTier: 'default',
  }), /context_preflight_(pricing_threshold|max_normal|compaction_required)/);
  await assert.rejects(() => runResponsesAgent({
    provider, capabilityAdapter, cwd: process.cwd(), prompt: 'small task', model: 'gpt-6-astra', reasoningEffort: 'low', serviceTier: 'fast', maxCallCostUsd: 0.01,
  }), /projected_call_cost_exceeds_budget/);
});
