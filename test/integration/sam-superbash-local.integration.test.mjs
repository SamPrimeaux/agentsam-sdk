import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createShellSamAdapter } from '../../src/sam/shell-host.js';
import { createLocalScriptRuntime, localScriptEnvironment, isLocalBashAvailable } from '../../src/sam/adapters/local-script-runtime.js';
import { createLocalScriptStore } from '../../src/sam/adapters/local-script-store.js';
import { toolApprovalKey } from '../../src/lib/execution-approvals.js';

async function fixture(t) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'sam-superbash-e2e-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const home = path.join(parent, 'home');
  const root = path.join(parent, 'project');
  await fs.mkdir(home);
  await fs.mkdir(root);
  return { parent, home, root, identity: { accountId: 'acct_test', actorId: 'au_test', installationId: 'inst_test' } };
}

test('authenticated CLI SAM operation executes real Bash and saved script artifacts', async t => {
  const f = await fixture(t);
  const permissions = [];
  const adapter = createShellSamAdapter({
    state: { home: f.home, cwd: f.root, projectRoot: f.root },
    trustedIdentity: f.identity,
    authorize: async req => { permissions.push(req.capability_id); return true; },
  });
  for (const id of ['sam.script.save', 'sam.script.get', 'sam.superbash']) {
    assert.equal(adapter.canInvoke(id), true);
    assert.ok(adapter.toolDescriptors().some(x => x.name === id && x.output_schema?.type === 'object'));
  }
  const script = 'printf "executed\\n" > output.txt\nprintf "OK\\n"';
  const saved = await adapter.invoke('sam.script.save', { script });
  assert.equal(saved.ok, true, JSON.stringify(saved.error));
  assert.match(saved.data.artifactRef, /^sam-script\//);
  const loaded = await adapter.invoke('sam.script.get', { scriptId: saved.data.scriptId, version: 1 });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.data.script, script);
  const executed = await adapter.invoke('sam.superbash', { scriptArtifactRef: saved.data.artifactRef });
  assert.equal(executed.ok, true, JSON.stringify(executed.error));
  assert.equal(executed.data.status, 'completed');
  assert.equal(executed.data.exitCode, 0);
  assert.equal(executed.data.lane, 'local');
  assert.match(executed.data.stdout, /OK/);
  assert.equal((await fs.readFile(path.join(f.root, 'output.txt'), 'utf8')), 'executed\n');
  assert.deepEqual(permissions, ['sam.script.save', 'sam.script.get', 'sam.superbash']);
});

test('model receives structured nonzero failure with diagnostics, never a success receipt', async t => {
  const f = await fixture(t);
  const adapter = createShellSamAdapter({
    state: { home: f.home, cwd: f.root, projectRoot: f.root },
    trustedIdentity: f.identity, authorize: async () => true,
  });
  const result = await adapter.invoke('sam.superbash', { script: 'echo failure-detail >&2; exit 9' });
  assert.equal(result.ok, false);
  assert.equal(result.data.status, 'failed');
  assert.equal(result.data.exitCode, 9);
  assert.match(result.data.stderr, /failure-detail/);
  assert.match(result.data.scriptHash, /^[a-f0-9]{64}$/);
});

test('multi-command script fails fast without silently masking the first command failure', async t => {
  const f = await fixture(t);
  const runtime = createLocalScriptRuntime({ root: f.root });
  const result = await runtime.executeScript({ ...f.identity,
    script: 'false; touch not-allowed-to-finish',
  });
  assert.notEqual(result.status, 'completed');
  await assert.rejects(fs.stat(path.join(f.root, 'not-allowed-to-finish')), { code: 'ENOENT' });
});

test('SAM CLI status enumerates real bound local script tools with verified host identity', async t => {
  const f = await fixture(t);
  const { runSam } = await import('../../src/commands/sam.js');
  const report = await runSam(['status', '--json'], {
    state: { home: f.home, cwd: f.root, projectRoot: f.root },
    identityLoader: async () => f.identity,
    write: () => {},
  });
  assert.equal(report.ok, true);
  assert.ok(report.host_model_operations.includes('sam.superbash'));
  assert.ok(report.host_model_operations.includes('sam.script.save'));
  assert.ok(report.host_model_operations.includes('sam.script.get'));
});

test('a tampered saved script fails integrity verification instead of being executed', async t => {
  const f = await fixture(t);
  const store = createLocalScriptStore({ home: f.home });
  const record = await store.saveVersion({ ...f.identity, script: 'echo safe' });
  const file = path.join(f.home, '.agentsam', 'scripts', f.identity.accountId, f.identity.actorId, f.identity.installationId, record.scriptId, 'v1.json');
  const data = JSON.parse(await fs.readFile(file, 'utf8'));
  data.script = 'echo modified';
  await fs.writeFile(file, JSON.stringify(data));
  await assert.rejects(store.getByArtifactRef({ ...f.identity, artifactRef: record.artifactRef }), /script_integrity_or_scope_mismatch/);
});

test('versioned script store enforces CAS, immutable refs and actor/installation isolation', async t => {
  const f = await fixture(t);
  const store = createLocalScriptStore({ home: f.home });
  const a = await store.saveVersion({ ...f.identity, script: 'echo one' });
  assert.equal(a.version, 1);
  await assert.rejects(store.saveVersion({ ...f.identity, scriptId: a.scriptId, script: 'echo surprise' }), /script_version_conflict/);
  const b = await store.saveVersion({ ...f.identity, scriptId: a.scriptId, expectedVersion: 1, script: 'echo two' });
  assert.equal(b.version, 2);
  assert.equal((await store.getByArtifactRef({ ...f.identity, artifactRef: a.artifactRef })).script, 'echo one');
  assert.equal((await store.getByArtifactRef({ ...f.identity, artifactRef: b.artifactRef })).script, 'echo two');
  for (const other of [{ actorId: 'other' }, { accountId: 'other' }, { installationId: 'other' }]) {
    assert.equal(await store.getByArtifactRef({ ...f.identity, ...other, artifactRef: a.artifactRef }), null);
  }
  await assert.rejects(store.saveVersion({ ...f.identity, scriptId: '../escape', script: 'echo no' }), /script_id_invalid/);
});

test('real script failures, timeout, cancellation and output limit never become success', async t => {
  const f = await fixture(t);
  const runtime = createLocalScriptRuntime({ root: f.root, timeoutMs: 100, maxOutputBytes: 1024 });
  const failed = await runtime.executeScript({ ...f.identity, script: 'echo diagnostic >&2; exit 7' });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.exitCode, 7);
  assert.match(failed.stderr, /diagnostic/);
  const timed = await runtime.executeScript({ ...f.identity, script: 'sleep 3' });
  assert.equal(timed.status, 'timed_out');
  assert.equal(timed.error.code, 'process_timeout');
  const controller = new AbortController();
  controller.abort();
  const cancelled = await runtime.executeScript({ ...f.identity, script: 'echo not-run', signal: controller.signal });
  assert.equal(cancelled.status, 'cancelled');
  const oversized = await runtime.executeScript({ ...f.identity, script: 'for i in {1..300}; do printf "abcdefghij"; done' });
  assert.equal(oversized.status, 'output_limit');
});

test('project workspace paths and execution lanes are host-bounded', async t => {
  const f = await fixture(t);
  const outside = path.join(f.parent, 'outside');
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(f.root, 'escape'));
  const runtime = createLocalScriptRuntime({ root: f.root });
  for (const relativeCwd of ['..', outside, 'escape']) {
    await assert.rejects(runtime.executeScript({ ...f.identity, script: 'pwd', relativeCwd }), /outside_project|relative_cwd_invalid/);
  }
  await assert.rejects(runtime.executeScript({ ...f.identity, script: 'pwd', laneRef: 'sandbox' }), /local_script_lane_denied/);
});

test('denied CLI permission blocks execution without touching disk', async t => {
  const f = await fixture(t);
  const calls = [];
  const adapter = createShellSamAdapter({
    state: { home: f.home, cwd: f.root, projectRoot: f.root },
    trustedIdentity: f.identity,
    authorize: async req => { calls.push(req.capability_id); return false; },
  });
  const response = await adapter.invoke('sam.superbash', { script: 'touch should-not-exist.txt' });
  assert.equal(response.ok, false);
  assert.deepEqual(calls, ['sam.superbash']);
  await assert.rejects(fs.stat(path.join(f.root, 'should-not-exist.txt')), { code: 'ENOENT' });
});

test('no secret environment inheritance and remembered approval is per script', async t => {
  const f = await fixture(t);
  const env = { ...process.env, AGENTSAM_API_KEY: 'secret', AWS_ACCESS_KEY_ID: 'secret', HOME: f.home };
  assert.equal(localScriptEnvironment(env).AGENTSAM_API_KEY, undefined);
  assert.equal(localScriptEnvironment(env).AWS_ACCESS_KEY_ID, undefined);
  const runtime = createLocalScriptRuntime({ root: f.root, env });
  const result = await runtime.executeScript({ ...f.identity,
    script: 'printenv AGENTSAM_API_KEY || printf empty; printf :; printenv AWS_ACCESS_KEY_ID || printf empty',
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.stdout, 'empty:empty');
  const first = toolApprovalKey('sam.superbash', { script: 'echo one' });
  assert.notEqual(first, toolApprovalKey('sam.superbash', { script: 'echo two' }));
  assert.notEqual(first, toolApprovalKey('sam.superbash', { script: 'echo one', relativeCwd: 'src' }));
});

test('Bash is only advertised when executable exists in the host PATH', () => {
  assert.equal(isLocalBashAvailable({ PATH: '' }), false);
  assert.equal(isLocalBashAvailable(), true);
});

test('host-owned concurrency limit rejects excess local work', async t => {
  const f = await fixture(t);
  const runtime = createLocalScriptRuntime({ root: f.root, maxConcurrent: 1 });
  const first = runtime.executeScript({ ...f.identity, script: 'sleep 0.25' });
  await new Promise(resolve => setTimeout(resolve, 60));
  await assert.rejects(runtime.executeScript({ ...f.identity, script: 'echo second' }), /script_runtime_busy/);
  assert.equal((await first).status, 'completed');
});
