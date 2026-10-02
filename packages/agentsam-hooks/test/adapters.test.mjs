import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  createAgentCapabilityAdapter,
  createCompositeCapabilityAdapter,
  createHookRuntime,
  createHookRuntimeFromConfig,
  createHookStore,
  createLspCapabilityAdapter,
  createMcpCapabilityAdapter,
  findHookConfig,
  registerStoredHooks,
} from '../src/index.js';

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-hooks-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('explicit project config discovers and runs a relative command adapter', async (t) => {
  const root = temporaryDirectory(t);
  const nested = path.join(root, 'src', 'nested');
  fs.mkdirSync(path.join(root, '.agentsam'), { recursive: true });
  fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(root, 'hooks', 'allow.mjs'), `let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const e=JSON.parse(s);console.log(JSON.stringify({permission_decision:e.input.tool_name==='safe'?'allow':'deny'}));});\n`);
  const configFile = path.join(root, '.agentsam', 'hooks.json');
  fs.writeFileSync(configFile, JSON.stringify({
    schema: 'agentsam.hooks.config.v1',
    adapters: { policy: { type: 'command', command: process.execPath, args: ['hooks/allow.mjs'], cwd: '..', timeout_ms: 2000 } },
    hooks: { pre_tool_use: [{ id: 'policy', adapter: 'policy', failure_mode: 'closed' }] },
  }));
  // cwd paths are intentionally constrained to the config directory by default.
  assert.throws(() => createHookRuntimeFromConfig(configFile), /outside_config_directory/);

  fs.copyFileSync(path.join(root, 'hooks', 'allow.mjs'), path.join(root, '.agentsam', 'allow.mjs'));
  fs.writeFileSync(configFile, JSON.stringify({
    schema: 'agentsam.hooks.config.v1',
    adapters: { policy: { type: 'command', command: process.execPath, args: ['allow.mjs'], timeout_ms: 2000 } },
    hooks: { pre_tool_use: [{ id: 'policy', adapter: 'policy', failure_mode: 'closed', match: { tool_name: { $eq: 'safe' } } }] },
  }));
  assert.equal(findHookConfig(nested), configFile);
  const { runtime } = createHookRuntimeFromConfig(configFile);
  const result = await runtime.dispatch('pre_tool_use', { tool_name: 'safe', tool_args: {} });
  assert.equal(result.output.permission_decision, 'allow');
  const skipped = await runtime.dispatch('pre_tool_use', { tool_name: 'other', tool_args: {} });
  assert.equal(skipped.receipts.length, 0);
});

test('MCP adapter discovers tools through a host port', async () => {
  const calls = [];
  const adapter = await createMcpCapabilityAdapter({
    servers: { docs: {} },
    listTools: async (server) => ({ tools: [{ name: 'search', description: 'Search docs', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }] }),
    callTool: async (server, tool, args) => { calls.push({ server, tool, args }); return { matches: 2 }; },
  });
  assert.equal(adapter.toolDescriptors()[0].name, 'mcp.docs.search');
  assert.deepEqual(await adapter.invoke('mcp.docs.search', { q: 'hooks' }), { matches: 2 });
  assert.deepEqual(calls[0], { server: 'docs', tool: 'search', args: { q: 'hooks' } });

  const timedOut = await createMcpCapabilityAdapter({
    servers: { docs: { transport: 'stdio', tools: [{ name: 'search' }] } },
    callTool: async () => { throw new Error('request timed out'); },
  });
  await assert.rejects(timedOut.invoke('mcp.docs.search', {}), (error) => {
    assert.equal(error.reason, 'mcp_timeout');
    assert.equal(error.adapter, 'mcp');
    assert.equal(error.protocol, 'mcp');
    assert.equal(error.transport, 'stdio');
    return true;
  });
});

test('LSP adapter maps portable capabilities to standard protocol methods', async () => {
  const calls = [];
  const adapter = createLspCapabilityAdapter({
    languages: { typescript: { command: 'typescript-language-server' } },
    request: async (language, method, params) => { calls.push({ language, method, params }); return { contents: 'number' }; },
  });
  const result = await adapter.invoke('lsp.hover', { language: 'typescript', document_uri: 'file:///project/a.ts', line: 2, character: 4 });
  assert.deepEqual(result, { contents: 'number' });
  assert.equal(calls[0].method, 'textDocument/hover');
  assert.deepEqual(calls[0].params.position, { line: 2, character: 4 });

  const unavailable = createLspCapabilityAdapter({
    languages: { rust: { command: 'rust-analyzer' } },
    request: async () => { throw Object.assign(new Error('server not running'), { code: 'ENOENT' }); },
  });
  await assert.rejects(unavailable.invoke('lsp.hover', { language: 'rust', document_uri: 'file:///a.rs', line: 0, character: 0 }), (error) => {
    assert.equal(error.reason, 'lsp_server_unavailable');
    assert.equal(error.adapter, 'lsp');
    assert.equal(error.protocol, 'lsp');
    assert.equal(error.transport, 'stdio');
    return true;
  });
});

test('sub-agent adapter emits lifecycle hooks around host scheduling', async () => {
  const lifecycle = [];
  const hooks = createHookRuntime({ hooks: {
    subagent_start: ({ input }) => { lifecycle.push(`start:${input.agent_id}`); },
    subagent_stop: ({ input }) => { lifecycle.push(`stop:${input.status}`); },
  } });
  const adapter = createAgentCapabilityAdapter({
    agents: [{ id: 'reviewer', description: 'Review a bounded patch.' }],
    hookRuntime: hooks,
    runAgent: async ({ task }) => ({ summary: `reviewed ${task}` }),
  });
  const result = await adapter.invoke('agent.delegate.reviewer', { task: 'the hook package' });
  assert.equal(result.summary, 'reviewed the hook package');
  assert.deepEqual(lifecycle, ['start:reviewer', 'stop:completed']);
});

test('composite adapter rejects duplicate names and routes distinct capabilities', async () => {
  const first = { toolDescriptors: () => [{ name: 'one' }], invoke: async () => 1 };
  const second = { toolDescriptors: () => [{ name: 'two' }], invoke: async () => 2 };
  const composite = createCompositeCapabilityAdapter([first, second]);
  assert.equal(await composite.invoke('two'), 2);
  assert.throws(() => createCompositeCapabilityAdapter([first, first]).toolDescriptors(), /duplicate_capability/);
});

test('portable hook store keeps scoped definitions and value-free execution evidence', async () => {
  const database = new DatabaseSync(':memory:');
  const schemaFile = path.resolve(import.meta.dirname, '../schema/migrations/sqlite/001_hooks_core.sql');
  database.exec(fs.readFileSync(schemaFile, 'utf8'));
  const db = {
    prepare(sql) {
      const statement = database.prepare(sql);
      return {
        bind(...values) {
          return {
            run: async () => statement.run(...values),
            first: async () => statement.get(...values) ?? null,
            all: async () => ({ results: statement.all(...values) }),
          };
        },
      };
    },
  };
  const store = createHookStore(db, { ownerId: 'acct_test' });
  await store.upsertHook({
    hook_key: 'audit.prompt',
    event_type: 'user_prompt_submitted',
    source_kind: 'stored',
    scope_type: 'project',
    scope_ref: '/workspace/demo',
    handler_type: 'log_only',
    match: { prompt: { $contains: 'persist' } },
    priority: 20,
  });
  assert.equal((await store.listHooks({ context: { project_root: '/workspace/other' } })).length, 0);
  assert.equal((await store.listHooks({ context: { project_root: '/workspace/demo' } })).length, 1);

  const runtime = createHookRuntime();
  await registerStoredHooks(runtime, store, { cwd: '/workspace/demo', context: { project_root: '/workspace/demo' } });
  const skipped = await runtime.dispatch('user_prompt_submitted', { prompt: 'unmatched' }, { session_id: 'sess_1' });
  assert.equal(skipped.receipts.length, 0);
  const dispatched = await runtime.dispatch('user_prompt_submitted', { prompt: 'do not persist me' }, {
    session_id: 'sess_1',
    metadata: { private_note: 'also do not persist me' },
  });
  await store.recordExecution(dispatched.receipts[0], {
    source_kind: 'stored',
    context: { trace_id: 'trace_safe', private_note: 'still do not persist me' },
  });
  const executions = await store.listExecutions();
  assert.equal(executions.length, 1);
  assert.deepEqual(executions[0].input_keys, ['prompt']);
  assert.doesNotMatch(executions[0].receipt_json, /do not persist me/);
  assert.deepEqual(executions[0].receipt.invocation, { session_id: 'sess_1' });
  assert.deepEqual(executions[0].correlation, { trace_id: 'trace_safe' });

  await store.recordExecution({
    schema: 'agentsam.hook.receipt.v1', hook_id: 'audit.prompt', hook: 'post_tool_use', status: 'failed',
    started_at: 1, completed_at: 2, duration_ms: 1, input_keys: ['tool_name'], output_keys: [],
    error: {
      error_code: 'DEADLINE_EXCEEDED', reason: 'hook_http_timeout', domain: 'hook', failure_class: 'timeout',
      stage: 'execute', feature: 'hooks.post_tool_use', failure_behavior: 'fail_open', retryable: false,
      side_effect_state: 'confirmed_applied', adapter: 'http', protocol: 'http', transport: 'https',
      fingerprint: 'err_1234567890abcdef', message: 'redacted timeout',
    },
    native_evidence: { code: 'ETIMEDOUT', exception_type: 'Error', message: 'redacted timeout' },
  });
  const failed = (await store.listExecutions()).find((row) => row.status === 'timeout');
  assert.equal(failed.error_code, 'DEADLINE_EXCEEDED');
  assert.equal(failed.reason, 'hook_http_timeout');
  assert.equal(failed.receipt.error.failure_behavior, 'fail_open');
  assert.equal(failed.receipt.error.side_effect_state, 'confirmed_applied');
  assert.equal(failed.receipt.native_evidence.code, 'ETIMEDOUT');
  database.close();
});

test('generated package schemas stay byte-identical to protocol authority', () => {
  const root = path.resolve(import.meta.dirname, '../../..');
  for (const filename of [
    'agentsam.hook.v1.schema.json',
    'agentsam.hook.output.v1.schema.json',
    'agentsam.hook.receipt.v1.schema.json',
    'agentsam.hooks.config.v1.schema.json',
  ]) {
    assert.equal(
      fs.readFileSync(path.join(root, 'protocol', 'hooks', filename), 'utf8'),
      fs.readFileSync(path.join(root, 'packages', 'agentsam-hooks', 'protocol', filename), 'utf8'),
    );
  }
  assert.equal(
    fs.readFileSync(path.join(root, 'migrations', 'runtime', '0005_agentsam_hooks.sql'), 'utf8'),
    fs.readFileSync(path.join(root, 'packages', 'agentsam-hooks', 'schema', 'migrations', 'sqlite', '001_hooks_core.sql'), 'utf8'),
  );
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'packages', 'agentsam-hooks', 'schema', 'manifest.json'))).id, 'agentsam.hooks');
});
