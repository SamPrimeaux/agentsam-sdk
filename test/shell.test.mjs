import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { dispatchShellLine, installPasteCollapse, renderCollapsedPaste, renderShellCatalog, renderShellPrompt, shouldCollapsePaste, tokenizeShellLine } from '../src/commands/shell.js';
import { readCliPreferences, writeCliPreferences } from '../src/lib/cli-preferences.js';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

test('shell tokenizer preserves Windows paths and quoted arguments', () => {
  assert.deepEqual(tokenizeShellLine('/cd C:\\Users\\conno\\fuelnreetime'), ['/cd', 'C:\\Users\\conno\\fuelnreetime']);
  assert.deepEqual(tokenizeShellLine('/cd "C:\\Users\\Connor Smith\\repo"'), ['/cd', 'C:\\Users\\Connor Smith\\repo']);
  assert.deepEqual(tokenizeShellLine('/agent "inspect this repo"'), ['/agent', 'inspect this repo']);
});

test('interactive prompt derives username and cwd instead of hardcoding Agent Sam identity', () => {
  const env = { USER: 'alice', HOME: '/Users/alice' };
  assert.equal(renderShellPrompt('/Users/alice/code/demo', env), 'alice ~/code/demo > ');
  assert.equal(renderShellPrompt('/Users/alice', env), 'alice ~ > ');
  assert.equal(renderShellPrompt('/tmp/demo', env), 'alice /tmp/demo > ');
});

test('shell startup stays quiet and points to the picker', () => {
  const catalog = renderShellCatalog();
  for (const command of ['/model', '/usage', '/help', '/exit']) {
    assert.match(catalog, new RegExp(command.replace('/', '\\/')));
  }
  assert.match(catalog, /command picker/);
  assert.match(catalog, /Type normally to work with the selected model/);
  assert.doesNotMatch(catalog, /Slash commands \(/);
  assert.doesNotMatch(catalog, /\/reasoning\s+Set reasoning/);
});

test('dispatch handles help, menu fallback, pwd, cd, and exit without falling through to host shell', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-shell-'));
  const child = path.join(root, 'child folder');
  fs.mkdirSync(child);
  let output = '';
  const state = { cwd: root, write: (text) => { output += text; }, interactive: false };
  let result = await dispatchShellLine('/help', state);
  assert.equal(result.handled, true);
  assert.match(output, /Type normally to work with Agent Sam/);
  assert.match(output, /agentsam help <topic>/);
  output = '';
  await dispatchShellLine('/', state);
  assert.match(output, /command picker/);
  output = '';
  await dispatchShellLine('/pwd', state);
  assert.equal(output.trim(), root);
  output = '';
  await dispatchShellLine('/cd "child folder"', state);
  assert.equal(state.cwd, child);
  assert.equal(output.trim(), child);
  result = await dispatchShellLine('/exit', state);
  assert.equal(result.exit, true);
});

const stripAnsi = (text) => String(text || '').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

test('/usage renders the current session receipt without ending the session', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-shell-usage-'));
  let output = '';
  const state = {
    cwd: root, interactive: false, write: (text) => { output += text; },
    session: {
      id: 'asess_00000000-0000-4000-8000-000000000001', title: 'Usage test', model_key: 'openai:gpt-6-astra',
      cumulative_usage: { input_tokens: 21_244, cached_input_tokens: 60_544, output_tokens: 219 },
      total_cost_usd: 0.42, cost_breakdown_usd: { input: 0.2, cached_input: 0.02, output: 0.2 },
    },
  };
  const result = await dispatchShellLine('/usage', state);
  assert.equal(result.exit, false);
  const clean = stripAnsi(output);
  assert.match(clean, /AgentSam · Usage/);
  assert.match(clean, /input\s+21\.2k/);
  assert.match(clean, /output\s+219/);
  assert.match(clean, /cached\s+60\.5k/);
  assert.match(clean, /cost\s+\$0\.420/);
  assert.match(clean, /agentsam resume asess_00000000-0000-4000-8000-000000000001/);
});

test('/logout signs out locally and emits the same resumable usage receipt', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-shell-logout-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-shell-home-'));
  let output = '';
  const state = {
    cwd: root, home, interactive: false, write: (text) => { output += text; },
    session: {
      id: 'asess_00000000-0000-4000-8000-000000000002', title: 'Logout test', model_key: 'openai:gpt-6-astra',
      cumulative_usage: { input_tokens: 100, cached_input_tokens: 50, output_tokens: 25 },
      total_cost_usd: 0.0125, cost_breakdown_usd: { input: 0.005, cached_input: 0.0025, output: 0.005 },
    },
  };
  const result = await dispatchShellLine('/logout', state);
  assert.equal(result.exit, false);
  assert.match(output, /No local Agent Sam IAM session was stored/);
  assert.match(output, /Token usage: total=125 input=100 \(\+ 50 cached\) output=25/);
  assert.match(output, /Spent: \$0\.0125/);
  assert.match(output, /agentsam resume asess_00000000-0000-4000-8000-000000000002/);
});

test('reasoning and service-tier commands persist only supported controls for an exact model', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-shell-model-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'model-demo' }));
  writeCliPreferences(root, { trustedDirectory: true, modelPreference: 'openai:gpt-6-astra', reasoningEffort: 'low', serviceTier: 'default' });
  let output = '';
  const state = { cwd: root, write: (text) => { output += text; }, interactive: false };
  await dispatchShellLine('/reasoning high', state);
  assert.equal(readCliPreferences(root).reasoningEffort, 'high');
  await dispatchShellLine('/fast', state);
  assert.equal(readCliPreferences(root).serviceTier, 'fast');
  await dispatchShellLine('/flex', state);
  assert.equal(readCliPreferences(root).serviceTier, 'flex');
  await dispatchShellLine('/standard', state);
  assert.equal(readCliPreferences(root).serviceTier, 'default');
  assert.match(output, /reasoning → high/);
  assert.match(output, /Fast is a paid latency choice/);
  assert.match(output, /Flex trades latency/);
});

test('stale provider snapshots hydrate GPT-6 reasoning controls from the current catalog', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-shell-stale-model-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'stale-model-demo' }));
  writeCliPreferences(root, {
    trustedDirectory: true,
    modelPreference: 'openai:gpt-6-luna',
    reasoningEffort: 'auto',
    serviceTier: 'default',
    modelSnapshot: {
      model_key: 'openai:gpt-6-luna',
      provider: 'openai',
      provider_model_id: 'gpt-6-luna',
      label: 'gpt-6-luna',
      availability: 'available',
      availability_source: 'provider_api',
      context_window: null,
      context_window_source: 'unknown',
      max_output_tokens: null,
      max_output_tokens_source: 'unknown',
      reasoning_efforts: ['auto'],
      service_tiers: ['default'],
      capabilities: { responses: true },
    },
  });

  let output = '';
  const state = { cwd: root, write: (text) => { output += text; }, interactive: false };
  await dispatchShellLine('/reasoning', state);
  assert.match(output, /auto \| none \| low \| medium \| high \| xhigh \| max/);
  assert.match(output, /provider default: medium/);

  output = '';
  await dispatchShellLine('/reasoning high', state);
  assert.equal(readCliPreferences(root).reasoningEffort, 'high');
  assert.match(output, /reasoning → high/);

  output = '';
  await dispatchShellLine('/context', state);
  assert.match(output, /1,050,000/);
});

test('bare /context shows truthful economics without inventing active token usage', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-shell-context-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'context-demo' }));
  writeCliPreferences(root, { trustedDirectory: true, modelPreference: 'openai:gpt-6-astra', reasoningEffort: 'medium', serviceTier: 'default' });
  let output = '';
  await dispatchShellLine('/context', { cwd: root, write: (text) => { output += text; }, interactive: false });
  assert.match(output, /1,050,000/);
  assert.match(output, /272,000/);
  assert.match(output, /180,000/);
  assert.match(output, /unavailable · no provider\/local usage snapshot yet/);
  assert.match(output, /Batch is a separate asynchronous execution lane/);
});

test('CLI supports a deterministic one-shot slash command for regression tests', () => {
  const result = spawnSync(process.execPath, ['src/cli.js', 'shell', '--command', '/help'], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Type normally to work with Agent Sam/);
  assert.match(result.stdout, /agentsam help <topic>/);
  assert.match(result.stdout, /command picker/);
});

test('large pastes collapse into a single confirmation line', () => {
  const pasted = ['one', 'two', 'three', 'four', 'five', 'six'].join('\n');
  assert.equal(shouldCollapsePaste('short'), false);
  assert.equal(shouldCollapsePaste(pasted), true);
  assert.equal(shouldCollapsePaste('x'.repeat(301)), true);
  assert.equal(renderCollapsedPaste(pasted), '[Pasted 6 lines — Enter to run, Backspace to clear]');

  const writes = [];
  const rl = {
    terminal: true,
    line: '',
    cursor: 0,
    _refreshLine() { writes.push(this.line); },
    _ttyWrite(s) { this.line += s || ''; this.cursor = this.line.length; },
  };
  const restore = installPasteCollapse(rl);
  rl._ttyWrite(pasted);
  assert.equal(rl.line, '[Pasted 6 lines — Enter to run, Backspace to clear]');
  rl._ttyWrite('', { name: 'backspace' });
  assert.equal(rl.line, '');
  restore();
});

test('dispatchShellLine accepts "agentsam <cmd>" and bare common verbs without slash prefix', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-shell-verb-'));
  let output = '';
  const state = { cwd: root, write: (text) => { output += text; }, interactive: false };

  const r1 = await dispatchShellLine('agentsam help', state);
  assert.equal(r1.handled, true);
  assert.match(output, /Type normally to work with Agent Sam/);

  output = '';
  const r2 = await dispatchShellLine('help', state);
  assert.equal(r2.handled, true);
  assert.match(output, /Type normally to work with Agent Sam/);

  const r3 = await dispatchShellLine('exit', state);
  assert.equal(r3.exit, true);
});

test('/compact is discoverable, invokes native compaction, persists exact continuation and usage across resume', async () => {
  const { SLASH_COMMANDS } = await import('../src/lib/slash-commands.js');
  const { createLocalSession, loadLocalSession, loadSessionContinuation } = await import('../src/lib/local-sessions.js');
  const { runResponsesAgent } = await import('../src/agent/responses-runner.js');
  const { createOpenAIResponsesAdapter } = await import('../src/providers/openai-responses.js');
  assert.ok(SLASH_COMMANDS.some(row => row.cmd === '/compact'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-compact-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"compact-test"}');
  writeCliPreferences(root, { modelPreference: 'openai:gpt-6-astra', reasoningEffort: 'low', serviceTier: 'default' });
  const session = createLocalSession({ cwd: root, project_root: root, model_key: 'openai:gpt-6-astra', reasoning_effort: 'low', requested_service_tier: 'default', provider_state: { provider: 'openai', previous_response_id: 'resp_prior' }, cumulative_usage: { input_tokens: 10 } });
  const output = [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Keep the selected architecture' }] }, { type: 'compaction', id: 'cmp_item', encrypted_content: 'opaque+/==exact' }];
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'fixture-key';
  let rendered = '', calls = 0;
  const state = { cwd: root, projectRoot: root, interactive: false, session, write: text => { rendered += text; }, providerFetchImpl: async (url, init) => {
    calls++;
    assert.match(url, /responses\/compact$/);
    assert.equal(JSON.parse(init.body).previous_response_id, 'resp_prior');
    return { ok: true, status: 200, json: async () => ({ id: 'cmp_test', output, usage: { input_tokens: 1000, output_tokens: 100, input_tokens_details: { cached_tokens: 100 } } }) };
  } };
  try { await dispatchShellLine('/compact', state); }
  finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
  assert.equal(calls, 1);
  assert.match(rendered, /continuation saved/);
  const resumed = loadLocalSession(session.id, { projectRoot: root });
  assert.equal(resumed.cumulative_usage.input_tokens, 1010);
  assert.equal(resumed.cumulative_usage.cached_input_tokens, 100);
  assert.ok(resumed.total_cost_usd > 0);
  assert.equal(resumed.latest_compaction.compaction_id, 'cmp_test');
  const continuation = loadSessionContinuation(resumed);
  assert.deepEqual(continuation.compacted_input, output);
  assert.equal(resumed.provider_state.previous_response_id, undefined);
  const adapter = createOpenAIResponsesAdapter({ apiKey: 'test', fetchImpl: async (_, init) => {
    const body = JSON.parse(init.body);
    assert.deepEqual(body.input.slice(0, output.length), output);
    assert.equal(body.previous_response_id, undefined);
    return { ok: true, status: 200, json: async () => ({ id: 'resp_next', output_text: 'done', output: [], usage: { input_tokens: 120, output_tokens: 10 } }) };
  } });
  await runResponsesAgent({ provider: adapter, capabilityAdapter: { toolDescriptors: () => [] }, model: 'gpt-6-astra', prompt: 'continue', cwd: root, instructions: '', previousProviderState: continuation, previousUsageSnapshot: resumed.usage_snapshot });
  rendered = '';
  await dispatchShellLine('/compact status', state);
  assert.match(rendered, /180000/);
  assert.match(rendered, /cmp_test/);
  await dispatchShellLine('/session', state);
  assert.match(rendered, /Latest compaction: cmp_test/);
});

test('/compact fails closed for unsupported provider without an HTTP request', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-compact-unsupported-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"unsupported"}');
  writeCliPreferences(root, { modelPreference: 'gemini:test', modelSnapshot: { provider: 'gemini', model_key: 'gemini:test', provider_model_id: 'test', context_window: 128000, capabilities: {} } });
  let rendered = '', calls = 0;
  await dispatchShellLine('/compact', { cwd: root, interactive: false, write: text => { rendered += text; }, providerFetchImpl: async () => { calls++; } });
  assert.equal(calls, 0);
  assert.match(rendered, /native_compaction_unavailable:gemini/);
});
