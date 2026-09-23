import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createCapabilityAdapter } from '../src/agent/capability-adapter.js';
import { buildAgentToolSurface, capabilityFunctionName, resolveCapabilityFallback, runResponsesAgent } from '../src/agent/responses-runner.js';
import { getModelRecord } from '../src/models/index.js';

function usage(input = 10_000, cumulative = input) {
  return {
    current_context: { input_tokens: input, window_tokens: 1_050_000 },
    cumulative: { input_tokens: cumulative, output_tokens: 100, cached_input_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0 },
    estimate_kind: 'provider', provider_authoritative: true,
  };
}
function cost(total = 0.1) { return { total_usd: total, components_usd: { input: total * 0.5, cached_input: total * 0.1, cache_write: total * 0.1, output: total * 0.3 } }; }


test('runner accepts provider-verified models whose context window is unknown', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-unknown-window-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"unknown-window-demo"}');

  const modelRecord = Object.freeze({
    model_key: 'openai:gpt-5.6-luna',
    provider: 'openai',
    provider_model_id: 'gpt-5.6-luna',
    label: 'gpt-5.6-luna',
    availability: 'available',
    availability_source: 'provider_api',
    context_window: null,
    context_window_source: 'unknown',
    max_output_tokens: null,
    reasoning_efforts: Object.freeze(['auto']),
    service_tiers: Object.freeze(['default']),
    capabilities: Object.freeze({ responses: true }),
    pricing: null,
    context_policy: null,
  });
  const events = [];
  let instructions = '';
  const provider = {
    async create(params) {
      instructions = params.instructions || '';
      return {
        response_id: 'resp_unknown_window',
        output_text: 'working',
        actual_service_tier: 'default',
        tool_calls: [],
        usage_snapshot: {
          current_context: { input_tokens: 1200, window_tokens: 0 },
          cumulative: { input_tokens: 1200, output_tokens: 10, cached_input_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0 },
          estimate_kind: 'provider',
          provider_authoritative: true,
        },
        cost: null,
      };
    },
    async continueWithToolOutputs() { throw new Error('unused'); },
  };

  const result = await runResponsesAgent({
    provider,
    capabilityAdapter: createCapabilityAdapter(),
    cwd: root,
    prompt: 'inspect this repository',
    model: modelRecord.model_key,
    modelRecord,
    emit: event => events.push(event),
  });

  assert.equal(result.output_text, 'working');
  assert.match(instructions, /Project Card: unknown-window-demo/);
  const localSnapshot = events.find(event => event.type === 'context.snapshot' && event.payload?.estimate_kind === 'local');
  assert.ok(localSnapshot);
  assert.equal(localSnapshot.payload.window_tokens, null);
  assert.equal(localSnapshot.payload.pressure, 'unknown');
  assert.equal(localSnapshot.payload.resolver_receipt?.fallback_policy, 'bounded_unknown_model_window');
});

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

test('runner applies a cumulative input guardrail inside tool-heavy turns', async () => {
  let compactCalls = 0;
  let resumedInput = null;
  const capabilityAdapter = createCapabilityAdapter({
    handlers: { 'repository.snapshot': async () => ({ ok: true, evidence: 'bounded' }) },
  });
  const baseModel = getModelRecord('gpt-6-astra');
  const modelRecord = {
    ...baseModel,
    context_policy: {
      ...baseModel.context_policy,
      max_cumulative_input_tokens: 30_000,
    },
  };
  const provider = {
    async create(params) {
      if (params.input?.[0]?.type === 'compaction') {
        resumedInput = params.input;
        return { response_id: 'resp_after_compaction', output_text: 'done', tool_calls: [], usage_snapshot: usage(18_000, 49_000), cost: cost(0.1) };
      }
      return { response_id: 'resp_initial', output_text: '', tool_calls: [{ call_id: 'call_1', name: capabilityFunctionName('repository.snapshot'), arguments: '{}' }], usage_snapshot: usage(18_000, 40_000), cost: cost(0.1) };
    },
    async continueWithToolOutputs() { throw new Error('must compact before continuation'); },
    async compact() { compactCalls += 1; return { compaction_id: 'cmp_mid_turn', output: [{ type: 'compaction', encrypted_content: 'opaque' }], usage_delta: { input_tokens: 1_000, output_tokens: 100, cached_input_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0 }, cost: cost(0.01) }; },
  };
  const guarded = await runResponsesAgent({ provider, capabilityAdapter, cwd: process.cwd(), prompt: 'snapshot repository', model: 'gpt-6-astra', modelRecord });
  assert.equal(guarded.output_text, 'done');
  assert.equal(compactCalls, 1);
  assert.ok(resumedInput.some((row) => row.type === 'function_call_output'));
  assert.equal(guarded.continuation_compactions[0].compaction_id, 'cmp_mid_turn');
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

test('invalid selected tool surface is rejected before paid compaction or inference', async () => {
  let calls = 0;
  await assert.rejects(runResponsesAgent({
    model: 'gpt-6-astra', prompt: 'broken', instructions: '',
    previousProviderState: { previous_response_id: 'resp_prior' },
    previousUsageSnapshot: { current_context: { input_tokens: 190000 } },
    capabilityAdapter: { toolDescriptors: () => [{ name: 'broken', description: 'broken', input_schema: { type: 'object', properties: { value: { $ref: 'https://unknown' } } } }] },
    provider: { compact: async () => { calls++; }, create: async () => { calls++; }, continueWithToolOutputs: async () => {} },
  }), /tool_schema_invalid/);
  assert.equal(calls, 0);
});


// --- run-budget: named modes replace the unexplained literal 8 ---

function multiRoundProvider({ rounds, toolCallName, toolArgs }) {
  let createCalls = 0;
  let continueCalls = 0;
  const argsFor = (n) => toolArgs !== undefined ? toolArgs : JSON.stringify({ step: n });
  return {
    async create() {
      createCalls += 1;
      const remaining = rounds - continueCalls;
      if (remaining <= 0) {
        return { response_id: `resp_${createCalls}`, output_text: 'done', actual_service_tier: 'default', tool_calls: [], usage_snapshot: usage(10_000), cost: cost(0.01) };
      }
      return {
        response_id: 'resp_create',
        output_text: '', actual_service_tier: 'default',
        tool_calls: [{ call_id: `call_${continueCalls}`, name: toolCallName, arguments: argsFor(continueCalls) }],
        usage_snapshot: usage(10_000), cost: cost(0.01),
      };
    },
    async continueWithToolOutputs() {
      continueCalls += 1;
      const remaining = rounds - continueCalls;
      if (remaining <= 0) {
        return { response_id: `resp_final_${continueCalls}`, output_text: 'done', actual_service_tier: 'default', tool_calls: [], usage_snapshot: usage(10_000), cost: cost(0.01) };
      }
      return {
        response_id: `resp_${continueCalls}`,
        output_text: '', actual_service_tier: 'default',
        tool_calls: [{ call_id: `call_${continueCalls}`, name: toolCallName, arguments: argsFor(continueCalls) }],
        usage_snapshot: usage(10_000), cost: cost(0.01),
      };
    },
    async compact() { throw new Error('should_not_compact'); },
  };
}

test('default (quick) run mode preserves the exact previous behavior: stops at round 8', async () => {
  const capabilityAdapter = createCapabilityAdapter({ handlers: { 'repository.snapshot': async () => ({ ok: true }) } });
  const provider = multiRoundProvider({ rounds: 50, toolCallName: capabilityFunctionName('repository.snapshot') });
  await assert.rejects(() => runResponsesAgent({
    provider, capabilityAdapter, cwd: process.cwd(), prompt: 'snapshot repository', model: 'gpt-6-astra', reasoningEffort: 'low', serviceTier: 'default',
  }), /tool_round_limit_exceeded:8/);
});

test('an explicit maxToolRounds still overrides any run mode', async () => {
  const capabilityAdapter = createCapabilityAdapter({ handlers: { 'repository.snapshot': async () => ({ ok: true }) } });
  const provider = multiRoundProvider({ rounds: 50, toolCallName: capabilityFunctionName('repository.snapshot') });
  await assert.rejects(() => runResponsesAgent({
    provider, capabilityAdapter, cwd: process.cwd(), prompt: 'snapshot repository', model: 'gpt-6-astra', reasoningEffort: 'low', serviceTier: 'default',
    runMode: 'agent', maxToolRounds: 3,
  }), /tool_round_limit_exceeded:3/);
});

test('agent run mode survives well past the old 8-round ceiling and reports the run-budget receipt', async () => {
  const capabilityAdapter = createCapabilityAdapter({ handlers: { 'repository.snapshot': async () => ({ ok: true, at: Date.now() }) } });
  // 15 real tool rounds: strictly more than the old hard-coded 8, proving the
  // ceiling is gone under agent mode without needing a literal 128-round run.
  const provider = multiRoundProvider({ rounds: 15, toolCallName: capabilityFunctionName('repository.snapshot') });
  const result = await runResponsesAgent({
    provider, capabilityAdapter, cwd: process.cwd(), prompt: 'snapshot repository', model: 'gpt-6-astra', reasoningEffort: 'low', serviceTier: 'default',
    runMode: 'agent',
  });
  assert.equal(result.output_text, 'done');
  assert.equal(result.run_budget.run_mode, 'agent');
  assert.equal(result.run_budget.max_tool_rounds, 128);
  assert.equal(result.run_budget.tool_rounds, 15);
  assert.equal(result.run_budget.tool_calls, 15);
  assert.ok(Number.isInteger(result.run_budget.elapsed_ms));
  assert.ok(result.run_budget.elapsed_ms >= 0);
});

test('multiple tool calls in one provider response count as one round but multiple calls', async () => {
  const capabilityAdapter = createCapabilityAdapter({ handlers: { 'repository.snapshot': async () => ({ ok: true }) } });
  const alias = capabilityFunctionName('repository.snapshot');
  let step = 0;
  const provider = {
    async create() {
      step = 1;
      return {
        response_id: 'resp_1', output_text: '', actual_service_tier: 'default',
        tool_calls: [
          { call_id: 'a', name: alias, arguments: '{"churnDays":1}' },
          { call_id: 'b', name: alias, arguments: '{"churnDays":2}' },
          { call_id: 'c', name: alias, arguments: '{"churnDays":3}' },
        ],
        usage_snapshot: usage(10_000), cost: cost(0.01),
      };
    },
    async continueWithToolOutputs() {
      step = 2;
      return { response_id: 'resp_2', output_text: 'done', actual_service_tier: 'default', tool_calls: [], usage_snapshot: usage(10_000), cost: cost(0.01) };
    },
    async compact() { throw new Error('should_not_compact'); },
  };
  const result = await runResponsesAgent({
    provider, capabilityAdapter, cwd: process.cwd(), prompt: 'snapshot repository', model: 'gpt-6-astra', reasoningEffort: 'low', serviceTier: 'default',
  });
  assert.equal(step, 2);
  assert.equal(result.run_budget.tool_rounds, 1);
  assert.equal(result.run_budget.tool_calls, 3);
});

test('denial still terminates correctly under any run mode (budget change does not weaken approval gating)', async () => {
  const capabilityAdapter = createCapabilityAdapter({ handlers: { 'repository.snapshot': async () => { throw new Error('must_not_invoke'); } } });
  const provider = multiRoundProvider({ rounds: 50, toolCallName: capabilityFunctionName('repository.snapshot') });
  await assert.rejects(() => runResponsesAgent({
    provider, capabilityAdapter, cwd: process.cwd(), prompt: 'snapshot repository', model: 'gpt-6-astra', reasoningEffort: 'low', serviceTier: 'default',
    runMode: 'agent',
    beforeTool: async () => false,
  }), /tool_execution_not_approved:repository\.snapshot/);
});

test('repeated identical tool calls trigger no-progress protection independently of the round budget', async () => {
  const capabilityAdapter = createCapabilityAdapter({ handlers: { 'repository.snapshot': async () => ({ ok: true }) } });
  // Same capability, same arguments, every single round -- a stuck loop.
  // Even under the largest budget (long: 512), this must fail fast on
  // repetition rather than grinding to round 512.
  const provider = multiRoundProvider({ rounds: 500, toolCallName: capabilityFunctionName('repository.snapshot'), toolArgs: '{"churnDays":7}' });
  await assert.rejects(() => runResponsesAgent({
    provider, capabilityAdapter, cwd: process.cwd(), prompt: 'snapshot repository', model: 'gpt-6-astra', reasoningEffort: 'low', serviceTier: 'default',
    runMode: 'long',
  }), /no_progress_detected:\d+/);
});

test('varying tool-call arguments across rounds does not trip the no-progress guard', async () => {
  const capabilityAdapter = createCapabilityAdapter({ handlers: { 'repository.snapshot': async () => ({ ok: true }) } });
  const alias = capabilityFunctionName('repository.snapshot');
  let n = 0;
  const provider = {
    async create() {
      n += 1;
      return { response_id: `r${n}`, output_text: '', actual_service_tier: 'default', tool_calls: [{ call_id: `c${n}`, name: alias, arguments: JSON.stringify({ churnDays: n }) }], usage_snapshot: usage(10_000), cost: cost(0.01) };
    },
    async continueWithToolOutputs() {
      n += 1;
      if (n > 12) return { response_id: `r${n}`, output_text: 'done', actual_service_tier: 'default', tool_calls: [], usage_snapshot: usage(10_000), cost: cost(0.01) };
      return { response_id: `r${n}`, output_text: '', actual_service_tier: 'default', tool_calls: [{ call_id: `c${n}`, name: alias, arguments: JSON.stringify({ churnDays: n }) }], usage_snapshot: usage(10_000), cost: cost(0.01) };
    },
    async compact() { throw new Error('should_not_compact'); },
  };
  const result = await runResponsesAgent({
    provider, capabilityAdapter, cwd: process.cwd(), prompt: 'snapshot repository', model: 'gpt-6-astra', reasoningEffort: 'low', serviceTier: 'default',
    runMode: 'agent',
  });
  assert.equal(result.output_text, 'done');
  assert.ok(result.run_budget.tool_rounds >= 12);
});

// --- alias-drift fallback: a real capability not hydrated this round still dispatches ---

test('resolveCapabilityFallback recovers a real, currently-executable capability whose alias was not hydrated this round', () => {
  const capabilityAdapter = createCapabilityAdapter({ handlers: { 'terminal.exec': async () => ({ ok: true }) } });
  const alias = capabilityFunctionName('terminal.exec');
  const resolved = resolveCapabilityFallback(capabilityAdapter, alias);
  assert.ok(resolved);
  assert.equal(resolved.capabilityId, 'terminal.exec');
  assert.equal(resolved.descriptor.name, 'terminal.exec');
});

test('resolveCapabilityFallback returns null for a genuinely unknown / hallucinated alias', () => {
  const capabilityAdapter = createCapabilityAdapter();
  const resolved = resolveCapabilityFallback(capabilityAdapter, 'as_totally_made_up_capability');
  assert.equal(resolved, null);
});

test('runner dispatches a tool call whose alias is absent from this turn\'s hydrated tool surface, via fallback resolution', async () => {
  let invoked = null;
  const capabilityAdapter = createCapabilityAdapter({
    handlers: { 'terminal.exec': async (input) => { invoked = input; return { ok: true, ...input }; } },
  });
  const alias = capabilityFunctionName('terminal.exec');
  const provider = {
    async create() {
      // Simulate provider-side conversation memory carrying a tool name the
      // *current* turn's toolSurface didn't offer (see buildAgentToolSurface's
      // relevance-scored, maxTools-capped selection) -- the exact shape of the
      // production unrecognized_tool_call:as_terminal_exec failure.
      return {
        response_id: 'resp_1', output_text: '', actual_service_tier: 'default',
        tool_calls: [{ call_id: 'call_1', name: alias, arguments: '{"command":"git","args":["status"]}' }],
        usage_snapshot: usage(10_000), cost: cost(0.01),
      };
    },
    async continueWithToolOutputs(params) {
      assert.equal(params.toolOutputs[0].call_id, 'call_1');
      return { response_id: 'resp_2', output_text: 'done', actual_service_tier: 'default', tool_calls: [], usage_snapshot: usage(10_000), cost: cost(0.01) };
    },
    async compact() { throw new Error('should_not_compact'); },
  };
  const result = await runResponsesAgent({
    provider, capabilityAdapter, cwd: process.cwd(), prompt: 'snapshot inspect repository', model: 'gpt-6-astra', reasoningEffort: 'low', serviceTier: 'default',
  });
  assert.equal(result.output_text, 'done');
  assert.equal(invoked.command, 'git');
});
