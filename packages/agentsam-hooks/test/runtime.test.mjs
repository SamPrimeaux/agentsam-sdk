import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  HOOK_PROTOCOL_SCHEMA,
  AgentSamHooks,
  HookPermissionError,
  createCallbackHookAdapter,
  createCommandHookAdapter,
  createHookRuntime,
  createHookedCapabilityAdapter,
  createHookedProviderAdapter,
  createHttpHookAdapter,
  normalizeHookEvent,
  normalizeHookOutput,
} from '../src/index.js';

const cwd = process.cwd();

test('contract accepts ergonomic event/output aliases but emits canonical fields', () => {
  assert.equal(HOOK_PROTOCOL_SCHEMA, 'agentsam.hook.v1');
  assert.equal(new AgentSamHooks().list().length, 0);
  assert.equal(normalizeHookEvent('onPreToolUse'), 'pre_tool_use');
  assert.deepEqual(normalizeHookOutput('pre_tool_use', {
    permissionDecision: 'allow',
    modifiedArgs: { timeout: 30 },
    additionalContext: 'bounded context',
  }), {
    permission_decision: 'allow',
    modified_args: { timeout: 30 },
    additional_context: 'bounded context',
  });
  assert.throws(() => normalizeHookOutput('post_tool_use', { permission_decision: 'deny' }), /not_supported/);
  assert.throws(() => normalizeHookOutput('pre_tool_use', { permissionDecison: 'allow' }), /unsupported_hook_output_field/);
});

test('runtime composes modifications in priority order and receipts exclude values', async () => {
  const observed = [];
  const hooks = createHookRuntime({
    onReceipt: (receipt) => observed.push(receipt),
    hooks: {
      pre_tool_use: [
        {
          id: 'second', priority: 20,
          handler: ({ input }) => ({
            permission_decision: 'allow',
            modified_args: { ...input.tool_args, second: true },
            additional_context: 'second context',
          }),
        },
        {
          id: 'first', priority: 10,
          handler: ({ input }) => ({
            permission_decision: 'allow',
            modified_args: { ...input.tool_args, secret: 'not-in-receipt' },
            additional_context: 'first context',
          }),
        },
      ],
    },
  });
  const result = await hooks.dispatch('pre_tool_use', {
    tool_name: 'example.read', tool_args: { value: 1 },
  }, { session_id: 'session-test' }, { cwd });
  assert.deepEqual(result.input.tool_args, { value: 1, secret: 'not-in-receipt', second: true });
  assert.equal(result.output.additional_context, 'first context\n\nsecond context');
  assert.deepEqual(result.receipts.map((row) => row.hook_id), ['first', 'second']);
  assert.equal(JSON.stringify(observed).includes('not-in-receipt'), false);
});

test('pre hooks fail closed by default while observers fail open', async () => {
  const pre = createHookRuntime({ hooks: { pre_tool_use: { id: 'policy', handler: () => { throw new Error('offline api_key=do-not-record'); } } } });
  const denied = await pre.dispatch('pre_tool_use', { tool_name: 'x', tool_args: {} });
  assert.equal(denied.output.permission_decision, 'deny');
  assert.match(denied.output.permission_decision_reason, /failed closed/);
  assert.doesNotMatch(JSON.stringify(denied), /do-not-record/);

  const post = createHookRuntime({ hooks: { post_tool_use: { id: 'audit', handler: () => { throw new Error('offline'); } } } });
  const allowed = await post.dispatch('post_tool_use', { tool_name: 'x', tool_result: { ok: true } });
  assert.deepEqual(allowed.input.tool_result, { ok: true });
  assert.equal(allowed.errors.length, 1);
});

test('callback adapter exposes input and invocation without changing wire envelope', async () => {
  const handler = createCallbackHookAdapter((input, invocation, envelope) => ({
    permission_decision: input.tool_name === 'read' ? 'allow' : 'deny',
    metadata: { session: invocation.session_id, schema: envelope.schema },
  }));
  const hooks = createHookRuntime({ hooks: { pre_tool_use: handler } });
  const result = await hooks.dispatch('pre_tool_use', { tool_name: 'read', tool_args: {} }, { session_id: 's1' });
  assert.equal(result.output.permission_decision, 'allow');
  assert.deepEqual(result.output.metadata, { session: 's1', schema: 'agentsam.hook.v1' });
});

test('command adapter uses JSON stdin/stdout without a shell', async () => {
  const script = [
    "let data='';",
    "process.stdin.on('data', c => data += c);",
    "process.stdin.on('end', () => { const row=JSON.parse(data); console.error('diagnostic'); console.log(JSON.stringify({permission_decision: row.input.tool_name === 'safe' ? 'allow' : 'deny'})); });",
  ].join('');
  const adapter = createCommandHookAdapter({ command: process.execPath, args: ['-e', script], cwd, timeout_ms: 2_000 });
  const hooks = createHookRuntime({ hooks: { pre_tool_use: { id: 'external', handler: adapter } } });
  const result = await hooks.dispatch('pre_tool_use', { tool_name: 'safe', tool_args: {} }, {}, { cwd });
  assert.equal(result.output.permission_decision, 'allow');
});

test('HTTP adapter exchanges the canonical envelope with a portable service', async (t) => {
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      const envelope = JSON.parse(body);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        permission_decision: envelope.schema === 'agentsam.hook.v1' ? 'allow' : 'deny',
      }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const handler = createHttpHookAdapter({ url: `http://127.0.0.1:${address.port}/hook`, timeout_ms: 2_000 });
  const hooks = createHookRuntime({ hooks: { pre_tool_use: handler } });
  const result = await hooks.dispatch('pre_tool_use', { tool_name: 'read', tool_args: {} });
  assert.equal(result.output.permission_decision, 'allow');
});

test('capability wrapper enforces ask, argument modification, post transformation, and bounded retry', async () => {
  let attempts = 0;
  const hooks = createHookRuntime({ hooks: {
    pre_tool_use: ({ input }) => ({
      permission_decision: 'ask',
      modified_args: { ...input.tool_args, approved: true },
    }),
    post_tool_use: ({ input }) => ({ modified_result: { ...input.tool_result, transformed: true } }),
    error_occurred: ({ input }) => input.error_context === 'tool_execution'
      ? { error_handling: 'retry', retry_count: 1 }
      : null,
  } });
  const base = {
    toolDescriptors: () => [{ name: 'example.write', input_schema: { type: 'object' } }],
    async invoke(_id, input) {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary');
      return { input };
    },
  };
  const adapter = createHookedCapabilityAdapter(base, {
    hookRuntime: hooks,
    requestPermission: async () => true,
    maxRetries: 1,
  });
  const result = await adapter.invoke('example.write', { value: 1 });
  assert.equal(attempts, 2);
  assert.deepEqual(result, { input: { value: 1, approved: true }, transformed: true });

  const noApproval = createHookedCapabilityAdapter(base, { hookRuntime: hooks, requestPermission: async () => false });
  await assert.rejects(noApproval.invoke('example.write', {}), HookPermissionError);
});

test('provider wrapper modifies a provider-neutral request and result', async () => {
  const hooks = createHookRuntime({ hooks: {
    pre_model_use: ({ input }) => ({
      permission_decision: 'allow',
      modified_request: { ...input.request, model: 'portable-model', temperature: 0 },
    }),
    post_model_use: ({ input }) => ({ modified_result: { ...input.model_result, output_text: 'redacted' } }),
  } });
  let request;
  const provider = createHookedProviderAdapter({
    provider: 'fixture',
    async create(value) { request = value; return { output_text: 'raw', tool_calls: [] }; },
    async continueWithToolOutputs(value) { return this.create(value); },
  }, { hookRuntime: hooks });
  const result = await provider.create({ model: 'initial', input: 'hello' });
  assert.equal(request.model, 'portable-model');
  assert.equal(request.temperature, 0);
  assert.equal(result.output_text, 'redacted');
});

test('post-hook failures never replay a completed side effect or paid model request', async () => {
  const hooks = createHookRuntime({ hooks: {
    post_tool_use: { id: 'tool-post', failure_mode: 'error', handler: () => { throw new Error('observer failed'); } },
    post_model_use: { id: 'model-post', failure_mode: 'error', handler: () => { throw new Error('observer failed'); } },
    error_occurred: () => ({ error_handling: 'retry', retry_count: 3 }),
  } });
  let toolCalls = 0;
  const capability = createHookedCapabilityAdapter({
    toolDescriptors: () => [{ name: 'write' }],
    async invoke() { toolCalls += 1; return { ok: true }; },
  }, { hookRuntime: hooks });
  await assert.rejects(capability.invoke('write'), /hook_execution_failed:tool-post/);
  assert.equal(toolCalls, 1);

  let modelCalls = 0;
  const provider = createHookedProviderAdapter({
    provider: 'fixture',
    async create() { modelCalls += 1; return { output_text: 'paid result', tool_calls: [] }; },
    async continueWithToolOutputs() { throw new Error('unused'); },
  }, { hookRuntime: hooks });
  await assert.rejects(provider.create({ model: 'fixture' }), /hook_execution_failed:model-post/);
  assert.equal(modelCalls, 1);
});

test('runtime rejects duplicate hook ids', () => {
  const runtime = createHookRuntime();
  runtime.register('session_start', { id: 'same', handler: () => null });
  assert.throws(() => runtime.register('session_start', { id: 'same', handler: () => null }), /duplicate_hook_id/);
});
