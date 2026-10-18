/**
 * Superbash through AgentSamClient with the REAL local adapters (bash runtime + versioned script store).
 *
 * What this proves is why superbash exists: repetitive, deterministic work (repo sweeps, audits, inventories)
 * runs as one saved script instead of many LLM tool calls — the model sends a short artifact ref, gets a
 * compact digest back, and the receipt shows zero provider calls. Output is bounded, redacted and
 * environment-isolated before anything can reach a model.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentSamClient } from '../../../client.js';
import { createGeneratedSamOperations } from '../operation-pack.js';
import { createLocalScriptRuntime, isLocalBashAvailable } from '../../../adapters/local-script-runtime.js';
import { createLocalScriptStore } from '../../../adapters/local-script-store.js';

const identity = { accountId: 'test-account', actorId: 'test-actor', installationId: 'test-installation', authorizedLaneRef: 'local' };
const sha = (value) => createHash('sha256').update(value).digest('hex');
const canRun = isLocalBashAvailable() && spawnSync('git', ['--version']).status === 0;
const skip = canRun ? false : 'bash and git are required for real superbash execution';

// ---- fixture: three small repos, one project root, one outside dir for escape attempts -------------------------
const GIT_ENV = {
  ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
};
const scratch = [];
const tmp = (prefix) => { const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `superbash-${prefix}-`))); scratch.push(dir); return dir; };
let fx;
before(() => {
  if (!canRun) return;
  const project = tmp('project');
  const outside = tmp('outside');
  const repo = (name, commits) => {
    const dir = path.join(project, 'repos', name);
    fs.mkdirSync(dir, { recursive: true });
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe', env: GIT_ENV });
    git('init', '-q');
    git('symbolic-ref', 'HEAD', 'refs/heads/main');
    for (let i = 1; i <= commits; i++) { fs.writeFileSync(path.join(dir, `f${i}.txt`), String(i)); git('add', '.'); git('commit', '-q', '-m', `c${i}`); }
    return { dir, git };
  };
  repo('alpha', 1);                                           // clean
  const beta = repo('beta', 2);                               // 1 modified + 1 untracked
  fs.writeFileSync(path.join(beta.dir, 'f1.txt'), 'changed');
  fs.writeFileSync(path.join(beta.dir, 'scratch.txt'), 'x');
  repo('gamma', 3).git('branch', 'wip/x');                    // 2 branches
  fs.symlinkSync(outside, path.join(project, 'escape'));
  fx = { project, outside };
});
after(() => { for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true }); });

// ---- harness: real runtime + real store, with a spy in front of the runtime -----------------------------------
function harness({ authorized = true, maxOutputBytes = 4096, runtime = true, store = true } = {}) {
  const operations = new Map();
  const spy = [];
  const local = runtime && fx ? createLocalScriptRuntime({ root: fx.project, maxOutputBytes }) : null;
  const registration = createGeneratedSamOperations({
    defineSamOperation: (x) => x, registerSamOperation: (x) => operations.set(x.id, x), getSamOperation: (id) => operations.get(id),
    resolveTrustedContext: async () => identity, authorize: async () => authorized,
    scriptStore: store ? createLocalScriptStore({ root: tmp('store') }) : undefined,
    processRuntime: local ? { executeScript: async (args) => { spy.push(args); return local.executeScript(args); } } : undefined,
  });
  return { client: new AgentSamClient({ os: { get: (id) => operations.get(id) }, autoSeed: false }), spy, operations, registration };
}
const free = (result) => {                                    // deterministic work must cost zero model calls
  assert.equal(result.usage.provider_calls, 0);
  assert.equal(result.receipt.execution.model_used, false);
};

// One digest function, used by both the single-repo and the sweep script.
const DIGEST_FN = String.raw`digest() {
  branch=$(git branch --show-current)
  dirty=$(git status --porcelain | wc -l | tr -d ' ')
  untracked=$(git ls-files --others --exclude-standard | wc -l | tr -d ' ')
  commits=$(git rev-list --count HEAD)
  branches=$(git for-each-ref refs/heads --format='%(refname:short)' | wc -l | tr -d ' ')
  stashes=$(git stash list | wc -l | tr -d ' ')
  worktrees=$(git worktree list | wc -l | tr -d ' ')
  printf '{"repo":"%s","branch":"%s","dirty":%s,"untracked":%s,"commits":%s,"branches":%s,"stashes":%s,"worktrees":%s}' \
    "$(basename "$PWD")" "$branch" "$dirty" "$untracked" "$commits" "$branches" "$stashes" "$worktrees"
}
`;
const SINGLE = `${DIGEST_FN}digest; echo\n`;
const SWEEP = `${DIGEST_FN}sep=""; printf '['; for d in repos/*/; do printf '%s' "$sep"; (cd "$d" && digest); sep=","; done; echo ']'\n`;

// ---- tests ----------------------------------------------------------------------------------------------------
test('superbash and the script library are unavailable without their runtime/store', () => {
  const noRuntime = harness({ runtime: false });
  assert.equal(noRuntime.operations.has('sam.superbash'), false);
  assert.equal(noRuntime.registration.unavailable.find((x) => x.name === 'sam.superbash')?.reason, 'handler_not_bound');
  const noStore = harness({ store: false });
  assert.equal(noStore.operations.has('sam.script.save'), false);
});

test('save once, run by ref: a short ref replaces re-sending the script, at zero model cost', { skip }, async () => {
  const { client } = harness();
  const saved = await client.invoke('sam.script.save', { script: SINGLE, description: 'repo digest' });
  assert.equal(saved.ok, true); free(saved);
  const { artifactRef } = saved.data;
  const expected = { alpha: [0, 1, 1], beta: [2, 2, 1], gamma: [0, 3, 2] };   // [dirty, commits, branches]
  for (const [name, [dirty, commits, branches]] of Object.entries(expected)) {
    const input = { scriptArtifactRef: artifactRef, relativeCwd: `repos/${name}` };
    const run = await client.invoke('sam.superbash', input);
    assert.equal(run.ok, true, JSON.stringify(run.error)); free(run);
    const digest = JSON.parse(run.data.stdout);
    assert.deepEqual([digest.repo, digest.branch, digest.dirty, digest.commits, digest.branches], [name, 'main', dirty, commits, branches]);
    assert.ok(run.data.stdout.length < 400, 'the model gets a digest, not a log dump');
    assert.ok(JSON.stringify(input).length * 3 < run.data.scriptBytes, 'the call payload must be far smaller than the script it replaces');
    assert.equal(run.data.scriptHash, sha(SINGLE));
  }
});

test('one sweep call replaces N per-repo tool calls and is reproducible', { skip }, async () => {
  const { client } = harness();
  const a = await client.invoke('sam.superbash', { script: SWEEP });
  const b = await client.invoke('sam.superbash', { script: SWEEP });
  assert.equal(a.ok, true, JSON.stringify(a.error)); free(a);
  const repos = JSON.parse(a.data.stdout);
  assert.deepEqual(repos.map((r) => r.repo), ['alpha', 'beta', 'gamma']);
  assert.equal(repos.find((r) => r.repo === 'beta').untracked, 1);
  assert.equal(a.data.stdout, b.data.stdout);                                  // same script, same answer
  assert.equal(a.data.scriptHash, b.data.scriptHash);
  assert.equal(a.receipt.input_hash, b.receipt.input_hash);                    // cacheable by hash
  assert.notEqual(a.data.executionId, b.data.executionId);                     // but each run is its own execution
});

test('script versions are immutable and stale updates are rejected', { skip }, async () => {
  const { client } = harness();
  const v1 = await client.invoke('sam.script.save', { script: 'echo one\n' });
  const v2 = await client.invoke('sam.script.save', { script: 'echo two\n', scriptId: v1.data.scriptId, expectedVersion: 1 });
  assert.equal(v2.data.version, 2);
  const stale = await client.invoke('sam.script.save', { script: 'echo three\n', scriptId: v1.data.scriptId, expectedVersion: 1 });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.message, 'script_version_conflict');
  assert.equal((await client.invoke('sam.script.get', { scriptId: v1.data.scriptId })).data.script, 'echo two\n');
  assert.equal((await client.invoke('sam.superbash', { scriptArtifactRef: v1.data.artifactRef })).data.stdout, 'one\n');   // v1 still runs
  assert.equal((await client.invoke('sam.superbash', { scriptArtifactRef: v2.data.artifactRef })).data.stdout, 'two\n');
});

test('failures are structured results, never false success (-e and pipefail are on)', { skip }, async () => {
  const { client } = harness();
  const exit3 = await client.invoke('sam.superbash', { script: 'echo bad >&2; exit 3' });
  assert.equal(exit3.ok, false);
  assert.equal(exit3.data.exitCode, 3);
  assert.match(exit3.data.stderr, /bad/);
  assert.equal(exit3.error.code, 'script_execution_failed');
  const piped = await client.invoke('sam.superbash', { script: 'false | cat; echo SHOULD_NOT_PRINT' });
  assert.equal(piped.ok, false);
  assert.doesNotMatch(piped.data.stdout, /SHOULD_NOT_PRINT/);
});

test('output is bounded before it can reach a model', { skip }, async () => {
  const { client } = harness({ maxOutputBytes: 4096 });
  const flood = await client.invoke('sam.superbash', { script: 'yes x | head -c 200000' });
  assert.equal(flood.ok, false);
  assert.equal(flood.data.status, 'output_limit');
  assert.equal(flood.error.code, 'process_output_limit');
  assert.ok(flood.data.stdout.length <= 4096);
});

test('secrets are redacted and the host environment is not inherited', { skip }, async () => {
  const fragment = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const fakes = [['Bearer', fragment].join(' '), ['s', 'k-', fragment, 'ABCD'].join(''), ['gh', 'p_', fragment, 'AB'].join(''), ['aak', '_0967db1234567890abcdef'].join('')];
  process.env.SAM_TEST_HOST_SECRET = 'host-secret-value';
  try {
    const { client } = harness();
    const run = await client.invoke('sam.superbash', {
      script: [`echo "Authorization: ${fakes[0]}"`, `echo "key=${fakes[1]}"`, `echo "${fakes[2]}"`, `echo "AGENTSAM_API_KEY=${fakes[3]}"`, 'echo "host=${SAM_TEST_HOST_SECRET:-unset}"'].join('\n'),
    });
    assert.equal(run.ok, true, JSON.stringify(run.error));
    for (const raw of [fragment, 'aak_0967db']) assert.ok(!run.data.stdout.includes(raw), `${raw} must not reach the model`);
    assert.match(run.data.stdout, /\[REDACTED\]/);
    assert.match(run.data.stdout, /host=unset/);
  } finally { delete process.env.SAM_TEST_HOST_SECRET; }
});

test('the working directory cannot leave the project, including through a symlink', { skip }, async () => {
  const { client, spy } = harness();
  for (const relativeCwd of ['..', 'escape']) {
    const run = await client.invoke('sam.superbash', { script: 'pwd', relativeCwd });
    assert.equal(run.ok, false);
    assert.equal(run.error.message, 'script_relative_cwd_outside_project');
  }
  assert.equal((await client.invoke('sam.superbash', { script: 'pwd', relativeCwd: '/tmp' })).error.message, 'script_relative_cwd_invalid');
  assert.equal(spy.length, 3);   // the runtime refused them itself; nothing executed
});

test('exactly one script source is accepted', { skip }, async () => {
  const { client } = harness();
  const saved = await client.invoke('sam.script.save', { script: 'echo a\n' });
  const both = await client.invoke('sam.superbash', { script: 'echo a', scriptArtifactRef: saved.data.artifactRef });
  assert.equal(both.error.code, 'input:exactly_one_source_required');
  assert.equal((await client.invoke('sam.superbash', {})).ok, false);
});

test('trusted lane comes from the host, authorization denies before execution, idempotency keys are only hashed', { skip }, async () => {
  const allowed = harness();
  const run = await allowed.client.invoke('sam.superbash', { script: 'echo hi', idempotencyKey: 'raw-idempotency-key' });
  assert.equal(run.ok, true);
  assert.equal(allowed.spy[0].laneRef, 'local');
  assert.equal(allowed.spy[0].accountId, 'test-account');
  assert.equal(run.data.idempotencyKeyHash, sha('raw-idempotency-key'));
  assert.ok(!JSON.stringify(run).includes('raw-idempotency-key'));
  const smuggled = await allowed.client.invoke('sam.superbash', { script: 'echo hi', laneRef: 'owned-device' });
  assert.equal(smuggled.ok, false);                                            // a model cannot choose its own lane
  assert.equal(allowed.spy.length, 1);
  const denied = harness({ authorized: false });
  assert.equal((await denied.client.invoke('sam.superbash', { script: 'echo hi' })).ok, false);
  assert.equal(denied.spy.length, 0);
});
