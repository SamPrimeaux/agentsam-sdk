import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildMerkleTree, saveSnapshot, readSnapshot, validateSnapshot, diffTrees } from '../src/lib/merkle/index.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsam-merkle-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
async function write(root, name, content = name) {
  await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
  await fs.writeFile(path.join(root, name), content);
}
function run(args, cwd) { return spawnSync(process.execPath, [cli, 'merkle', ...args], { cwd, encoding: 'utf8', timeout: 15000 }); }

test('version 1 hashes match independent SHA-256 protocol vectors', async (t) => {
  const root = await fixture(t);
  assert.equal((await buildMerkleTree(root)).rootHash, 'sha256:6ce8ca443f3cf6c719c5cb9acc121403addf3f499eefa3db25edacf2c7fe0f94');
  await write(root, 'hello.txt', 'hello\n');
  const tree = await buildMerkleTree(root);
  assert.equal(tree.entries.find((entry) => entry.path === 'hello.txt').hash, 'sha256:831db02286b8511feabdd6cafb95c311548a91264cb86e4b9cdc56febee5ec72');
  assert.equal(tree.rootHash, 'sha256:c63f668abf314a79317d635bb88a31a680d4b8c3549fa5960ea6ce9be930d80f');
});

test('root depends on content and relative names, not creation order, absolute root, or timestamps', async (t) => {
  const a = await fixture(t), b = await fixture(t);
  await write(a, 'src/z.txt', 'one'); await write(a, 'a.txt', 'two');
  await write(b, 'a.txt', 'two'); await write(b, 'src/z.txt', 'one');
  await fs.utimes(path.join(b, 'a.txt'), 1, 1);
  const first = await buildMerkleTree(a), second = await buildMerkleTree(b);
  assert.equal(first.rootHash, second.rootHash);
  assert.deepEqual(first.entries, second.entries);
  await write(b, 'src/z.txt', 'ONE');
  const edited = await buildMerkleTree(b);
  assert.notEqual(first.rootHash, edited.rootHash);
  assert.equal(first.entries.find((x) => x.path === 'a.txt').hash, edited.entries.find((x) => x.path === 'a.txt').hash);
  assert.deepEqual(diffTrees(first, edited).stats, { unchanged: 1, modified: 1, added: 0, removed: 0 });
  await fs.rename(path.join(b, 'src/z.txt'), path.join(b, 'src/new.txt'));
  assert.deepEqual(diffTrees(edited, await buildMerkleTree(b)).stats, { unchanged: 1, modified: 0, added: 1, removed: 1 });
});

test('default ignores, explicit dist inclusion, literal exclusions, and empty-directory behavior are stable', async (t) => {
  const root = await fixture(t);
  await write(root, 'src/app.js');
  const first = await buildMerkleTree(root);
  for (const name of ['.git/config', 'node_modules/pkg/file', 'dist/app.js', '.DS_Store', '.agentsam/cache/data', '.agentsam/merkle/old.json']) await write(root, name);
  await fs.mkdir(path.join(root, 'empty'));
  assert.equal(first.rootHash, (await buildMerkleTree(root)).rootHash);
  const withDist = await buildMerkleTree(root, { include: ['dist'] });
  assert.equal(withDist.stats.files, 2);
  assert.notEqual(first.rootHash, withDist.rootHash);
  assert.throws(() => diffTrees(first, withDist), /different ignore rules/);
  const excluded = await buildMerkleTree(root, { exclude: ['src'] });
  assert.equal(excluded.stats.files, 0);
});

test('symlinks hash their literal target, including cycles, without reading the target', { skip: process.platform === 'win32' }, async (t) => {
  const root = await fixture(t), outside = await fixture(t);
  await write(outside, 'secret.txt', 'not read');
  await fs.symlink(outside, path.join(root, 'outside'));
  await fs.symlink('.', path.join(root, 'cycle'));
  const first = await buildMerkleTree(root);
  assert.equal(first.stats.files, 0); assert.equal(first.stats.symlinks, 2);
  await write(outside, 'secret.txt', 'changed');
  assert.equal(first.rootHash, (await buildMerkleTree(root)).rootHash);
  await fs.unlink(path.join(root, 'cycle'));
  await fs.symlink('missing-target', path.join(root, 'cycle'));
  assert.deepEqual(diffTrees(first, await buildMerkleTree(root)).stats, { unchanged: 1, modified: 1, added: 0, removed: 0 });
});

test('default and custom snapshots exclude themselves and preserve baseline until force is explicit', async (t) => {
  const root = await fixture(t);
  await write(root, 'file.txt', 'baseline');
  const initial = await buildMerkleTree(root);
  const { snapshot, output } = await saveSnapshot(root);
  assert.equal(initial.rootHash, snapshot.rootHash);
  assert.ok(diffTrees(snapshot, await buildMerkleTree(root, { policy: snapshot.policy })).equal);
  assert.equal((await readSnapshot(output)).rootHash, snapshot.rootHash);
  await assert.rejects(saveSnapshot(root), /exists/);
  await write(root, 'file.txt', 'edited');
  assert.equal(diffTrees(snapshot, await buildMerkleTree(root, { policy: snapshot.policy })).stats.modified, 1);
  const updated = await saveSnapshot(root, { force: true });
  assert.notEqual(updated.snapshot.rootHash, snapshot.rootHash);
  const custom = await saveSnapshot(root, { out: path.join(root, 'reports/baseline.json') });
  assert.deepEqual(custom.snapshot.policy.exclude, ['reports/baseline.json']);
  assert.ok(diffTrees(custom.snapshot, await buildMerkleTree(root, { policy: custom.snapshot.policy })).equal);
});

test('snapshot validation rejects corrupt hashes, duplicate paths, unsafe paths, and missing parents', async (t) => {
  const root = await fixture(t);
  await write(root, 'nested/a.txt');
  const tree = await buildMerkleTree(root);
  const changedHash = structuredClone(tree);
  changedHash.entries.find((x) => x.type === 'file').hash = 'sha256:' + '0'.repeat(64);
  assert.throws(() => validateSnapshot(changedHash), /hash mismatch/);
  const duplicate = structuredClone(tree); duplicate.entries.push(duplicate.entries[0]);
  assert.throws(() => validateSnapshot(duplicate), /duplicate/);
  const unsafe = structuredClone(tree); unsafe.entries.at(-1).path = '../outside';
  assert.throws(() => validateSnapshot(unsafe), /invalid\/duplicate path/);
  const missing = structuredClone(tree); missing.entries = missing.entries.filter((x) => x.path !== 'nested');
  assert.throws(() => validateSnapshot(missing), /parent/);
});

test('scan fails when a file disappears and honors cancellation', async (t) => {
  const root = await fixture(t);
  await write(root, 'a.txt'); await write(root, 'z.txt');
  let removed;
  await assert.rejects(buildMerkleTree(root, { onProgress(progress) {
    if (progress.path === 'a.txt') removed = fs.unlink(path.join(root, 'z.txt'));
  } }));
  await removed;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(buildMerkleTree(root, { signal: controller.signal }), { name: 'AbortError' });
});

test('CLI snapshot/verify/diff supports JSON, moved roots, and distinct mismatch/error exit codes', async (t) => {
  const root = await fixture(t), moved = await fixture(t);
  await write(root, 'a.txt', 'hello'); await write(moved, 'a.txt', 'hello');
  const saved = run(['snapshot', '.', '--json'], root);
  assert.equal(saved.status, 0, saved.stderr);
  const manifest = JSON.parse(saved.stdout);
  assert.ok(manifest.output.endsWith('merkle.json'));
  const matching = run(['verify', manifest.output, '--root', moved, '--json'], root);
  assert.equal(matching.status, 0, matching.stderr);
  assert.equal(JSON.parse(matching.stdout).equal, true);
  await write(moved, 'a.txt', 'changed'); await write(moved, 'b.txt', 'new');
  const changed = run(['verify', manifest.output, '--root', moved, '--json'], root);
  assert.equal(changed.status, 1, changed.stderr);
  assert.deepEqual(JSON.parse(changed.stdout).stats, { unchanged: 0, modified: 1, added: 1, removed: 0 });
  const diff = run(['diff', root, moved, '--json'], root);
  assert.equal(diff.status, 1, diff.stderr);
  const invalid = run(['root', '.', '--typo', '--json'], root);
  assert.equal(invalid.status, 2); assert.equal(invalid.stdout, '');
  assert.match(JSON.parse(invalid.stderr).error, /Unknown option/);
  const piped = run(['inspect', '.', '--tui'], root);
  assert.equal(piped.status, 0, piped.stderr);
  assert.ok(!piped.stdout.includes('\x1b'));
});
