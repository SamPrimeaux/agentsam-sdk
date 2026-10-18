/**
 * The superbash starter library (scripts/superbash/*.sh) through the REAL local runtime.
 * Contract: each digest is read-only, takes no arguments and prints ONE bounded JSON line.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalScriptRuntime, isLocalBashAvailable } from '../../src/sam/adapters/local-script-runtime.js';

const LIB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/superbash');
const IDENTITY = { accountId: 'test-account', actorId: 'test-actor', installationId: 'test-installation', laneRef: 'local' };
const has = (cmd) => spawnSync(cmd, ['--version']).status === 0;
const skip = isLocalBashAvailable() && has('git') && has('npm') ? false : 'bash, git and npm are required';
const NAMES = ['repo-state', 'worktree-sweep', 'diff-digest', 'leftovers', 'gate-digest'];

const GIT_ENV = {
  ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
};
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const scratch = [];
const tmp = (prefix) => { const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `digest-${prefix}-`))); scratch.push(dir); return dir; };

let fx;
before(() => {
  if (skip) return;
  const root = tmp('fx');
  const origin = path.join(root, 'origin.git');
  const project = path.join(root, 'project');
  fs.mkdirSync(project);
  git(root, 'init', '-q', '--bare', origin);
  git(project, 'init', '-q');
  git(project, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  fs.writeFileSync(path.join(project, 'README.md'), 'base\n');
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({
    scripts: {
      'errors:check': 'node -e "console.log(\'all good\')"',
      'verify:registry': 'node -e "console.log(\'boom\'); process.exit(3)"',
    },
  }));
  git(project, 'add', '.'); git(project, 'commit', '-q', '-m', 'base');
  git(project, 'remote', 'add', 'origin', origin);
  git(project, 'push', '-q', 'origin', 'main');
  git(project, 'checkout', '-q', '-b', 'feature');
  fs.mkdirSync(path.join(project, 'apps/x'), { recursive: true });
  fs.writeFileSync(path.join(project, 'apps/x/a.js'), '1\n2\n3\n');
  fs.writeFileSync(path.join(project, 'apps/x/b.js'), '1\n');
  fs.writeFileSync(path.join(project, 'notes.bak'), 'preserved\n');
  fs.appendFileSync(path.join(project, 'README.md'), 'edit\n');
  git(project, 'add', '.'); git(project, 'commit', '-q', '-m', 'feature work');
  fs.appendFileSync(path.join(project, 'README.md'), 'stashed\n');
  git(project, 'stash', 'push', '-q');
  fs.appendFileSync(path.join(project, 'README.md'), 'dirty\n');
  fs.writeFileSync(path.join(project, 'scratch.txt'), 'x\n');
  const sibling = path.join(root, 'wt-x');
  git(project, 'worktree', 'add', '-q', '-b', 'wip/x', sibling, 'origin/main');
  fs.writeFileSync(path.join(sibling, 'untracked.txt'), 'x\n');
  fx = { project, plain: tmp('plain') };
});
after(() => { for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true }); });

async function digest(name, root = fx.project) {
  const script = fs.readFileSync(path.join(LIB, `${name}.sh`), 'utf8');
  const result = await createLocalScriptRuntime({ root, maxOutputBytes: 16384 }).executeScript({ ...IDENTITY, script });
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 1, `${name} must print exactly one line, got ${lines.length}`);
  return { result, data: JSON.parse(lines[0]), bytes: Buffer.byteLength(result.stdout) };
}
const snapshot = () => ['status --porcelain', 'stash list', 'worktree list', 'for-each-ref', 'rev-parse HEAD']
  .map((args) => git(fx.project, ...args.split(' '))).join('\n---\n');

test('every digest is one bounded JSON line and leaves the repository untouched', { skip }, async () => {
  const before = snapshot();
  for (const name of NAMES) {
    const { data, bytes } = await digest(name);
    assert.match(data.schema, /^agentsam\.digest\.[a-z-]+\.v1$/, name);
    assert.ok(bytes < 2048, `${name} produced ${bytes} bytes`);
  }
  assert.equal(snapshot(), before);
});

test('repo-state answers "what state is this checkout in" in one call', { skip }, async () => {
  const { result, data } = await digest('repo-state');
  assert.equal(result.exitCode, 0);
  assert.equal(data.branch, 'feature');
  assert.deepEqual([data.vs, data.ahead, data.behind], ['origin/main', 1, 0]);
  assert.deepEqual([data.changes, data.untracked, data.stashes, data.worktrees], [2, 1, 1, 2]);
  assert.equal(data.last_subject, 'feature work');
});

test('worktree-sweep lists every worktree, dirtiest first, and flags ephemeral locations', { skip }, async () => {
  const { data } = await digest('worktree-sweep');
  assert.equal(data.total, 2);
  assert.equal(data.dirty, 2);
  assert.equal(data.truncated, false);
  const [first, second] = data.worktrees;
  assert.ok(first.dirty >= second.dirty);
  assert.deepEqual(data.worktrees.map((w) => w.branch).sort(), ['feature', 'wip/x']);
  assert.ok(data.worktrees.every((w) => typeof w.ahead === 'number' && typeof w.behind === 'number'));
});

test('diff-digest agrees with git numstat and never includes the diff', { skip }, async () => {
  const { data, result } = await digest('diff-digest');
  const numstat = git(fx.project, 'diff', '--no-renames', '--numstat', 'origin/main...HEAD').split('\n').map((l) => l.split('\t'));
  assert.equal(data.files, numstat.length);
  assert.equal(data.insertions, numstat.reduce((n, [a]) => n + Number(a), 0));
  assert.deepEqual(data.by_dir.find((d) => d.dir === 'apps/x'), { dir: 'apps/x', files: 2, add: 4, del: 0 });
  assert.equal(data.largest[0].path, 'apps/x/a.js');
  assert.ok(!result.stdout.includes('@@'));
});

test('leftovers finds preserved paths, wip-style branches and stashes', { skip }, async () => {
  const { data } = await digest('leftovers');
  assert.deepEqual(data.paths.shown, ['notes.bak']);
  assert.deepEqual(data.branches.shown, ['wip/x']);
  assert.equal(data.stashes, 1);
});

test('gate-digest returns pass/fail plus one tail line per gate, and fails when a gate fails', { skip }, async () => {
  const { result, data } = await digest('gate-digest');
  assert.equal(result.exitCode, 1);
  assert.equal(result.status, 'failed');
  assert.deepEqual([data.ok, data.ran, data.failed], [false, 2, 1]);   // brand:check and release:train:check are not defined here: skipped
  const byName = Object.fromEntries(data.gates.map((g) => [g.name, g]));
  assert.equal(byName['errors:check'].ok, true);
  assert.equal(byName['errors:check'].tail, 'all good');
  assert.equal(byName['verify:registry'].exit, 3);
  assert.equal(byName['verify:registry'].tail, 'boom');
});

test('outside a git repo (or without package.json) digests fail structurally with exit 2', { skip }, async () => {
  for (const name of ['repo-state', 'worktree-sweep', 'diff-digest', 'leftovers']) {
    const { result, data } = await digest(name, fx.plain);
    assert.equal(result.exitCode, 2, name);
    assert.equal(data.error, 'not_a_git_repo');
  }
  const gates = await digest('gate-digest', fx.plain);
  assert.equal(gates.data.error, 'no_package_json');
});
