import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../../src/cli.js', import.meta.url));

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsam-merkle-cli-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function write(root, name, content = name) {
  await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
  await fs.writeFile(path.join(root, name), content);
}

function run(args, cwd) {
  return spawnSync(process.execPath, [cli, 'merkle', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 15000,
  });
}

test('CLI snapshot/verify/diff supports JSON, moved roots, and distinct mismatch/error exit codes', async (t) => {
  const root = await fixture(t), moved = await fixture(t);
  await write(root, 'a.txt', 'hello');
  await write(moved, 'a.txt', 'hello');

  const saved = run(['snapshot', '.', '--json'], root);
  assert.equal(saved.status, 0, saved.stderr);
  const manifest = JSON.parse(saved.stdout);
  assert.ok(manifest.output.endsWith('merkle.json'));

  const matching = run(['verify', manifest.output, '--root', moved, '--json'], root);
  assert.equal(matching.status, 0, matching.stderr);
  assert.equal(JSON.parse(matching.stdout).equal, true);

  await write(moved, 'a.txt', 'changed');
  await write(moved, 'b.txt', 'new');
  const changed = run(['verify', manifest.output, '--root', moved, '--json'], root);
  assert.equal(changed.status, 1, changed.stderr);
  assert.deepEqual(JSON.parse(changed.stdout).stats, { unchanged: 0, modified: 1, added: 1, removed: 0 });

  const diff = run(['diff', root, moved, '--json'], root);
  assert.equal(diff.status, 1, diff.stderr);

  const invalid = run(['root', '.', '--typo', '--json'], root);
  assert.equal(invalid.status, 2);
  assert.equal(invalid.stdout, '');
  assert.match(JSON.parse(invalid.stderr).error, /Unknown option/);

  const piped = run(['inspect', '.', '--tui'], root);
  assert.equal(piped.status, 0, piped.stderr);
  assert.ok(!piped.stdout.includes('\x1b'));
});
