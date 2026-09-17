import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { dispatchShellLine, renderShellCatalog, renderShellPrompt, tokenizeShellLine } from '../src/commands/shell.js';
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

test('shell catalog only advertises implemented core controls', () => {
  const catalog = renderShellCatalog();
  for (const command of ['/model', '/reasoning', '/fast', '/flex', '/standard', '/context', '/cf', '/diff', '/clear', '/exit']) {
    assert.match(catalog, new RegExp(command.replace('/', '\\/')));
  }
  assert.match(catalog, /scrollable command picker/);
});

test('dispatch handles help, menu fallback, pwd, cd, and exit without falling through to host shell', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-shell-'));
  const child = path.join(root, 'child folder');
  fs.mkdirSync(child);
  let output = '';
  const state = { cwd: root, write: (text) => { output += text; }, interactive: false };
  let result = await dispatchShellLine('/help', state);
  assert.equal(result.handled, true);
  assert.match(output, /Slash commands/);
  output = '';
  await dispatchShellLine('/', state);
  assert.match(output, /Agent Sam Terminal/);
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
  assert.match(output, /Token usage: total=21,463 input=21,244 \(\+ 60,544 cached\) output=219/);
  assert.match(output, /Spent: \$0\.4200/);
  assert.match(output, /agentsam resume asess_00000000-0000-4000-8000-000000000001/);
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
  assert.match(result.stdout, /Agent Sam Terminal/);
  assert.match(result.stdout, /\/model/);
  assert.match(result.stdout, /\/exit/);
});
