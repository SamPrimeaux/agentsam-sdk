import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  captureDeployReceipt,
  finalizeDeployReceipt,
  showLatestDeployReceipt,
} from '../src/lib/deploy-receipt/index.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsam-deploy-receipt-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'receipt-test@example.invalid']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Receipt Test']);
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src/app.js'), 'export const value = 1;\n');
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, 'commit', '-qm', 'fixture']);
  return root;
}

function run(args, cwd) {
  return spawnSync(process.execPath, [cli, 'deploy-receipt', ...args], { cwd, encoding: 'utf8', timeout: 15000 });
}

test('successful finalize advances baseline while failure preserves the last trusted tree', async (t) => {
  const root = await fixture(t);
  const first = await captureDeployReceipt({ root, project: 'fixture' });
  assert.equal(first.receipt.has_baseline, false);
  assert.equal(first.receipt.baseline_source, 'none');
  assert.equal(first.receipt.working_tree_dirty, false);
  assert.ok(!first.snapshot.entries.some((entry) => entry.path.startsWith('.agentsam/deploy-merkle')));

  const promoted = await finalizeDeployReceipt({ root, status: 'success', deploymentId: 'dep_1' });
  assert.equal(promoted.receipt.status, 'success');
  assert.equal(promoted.receipt.deployment_id, 'dep_1');
  assert.equal((await showLatestDeployReceipt({ root })).root_hash, first.receipt.root_hash);

  const clean = await captureDeployReceipt({ root, project: 'fixture' });
  assert.equal(clean.receipt.has_baseline, true);
  assert.equal(clean.receipt.baseline_source, 'local');
  assert.deepEqual(clean.receipt.diff_stats, { unchanged: 1, modified: 0, added: 0, removed: 0 });
  assert.deepEqual(clean.receipt.changed_files, []);
  assert.equal(clean.receipt.root_hash, first.receipt.root_hash);
  assert.equal(clean.receipt.working_tree_dirty, false, 'runtime receipt state must not make the source tree dirty');

  await fs.writeFile(path.join(root, 'src/app.js'), 'export const value = 2;\n');
  const changed = await captureDeployReceipt({ root, project: 'fixture' });
  assert.equal(changed.receipt.working_tree_dirty, true);
  assert.deepEqual(changed.receipt.diff_stats, { unchanged: 0, modified: 1, added: 0, removed: 0 });
  assert.deepEqual(changed.receipt.changed_files, ['src/app.js']);
  assert.notEqual(changed.receipt.root_hash, first.receipt.root_hash);

  await finalizeDeployReceipt({ root, status: 'failed', deploymentId: 'dep_2' });
  assert.equal((await showLatestDeployReceipt({ root })).root_hash, first.receipt.root_hash, 'failed run must not advance baseline');

  const retry = await captureDeployReceipt({ root, project: 'fixture' });
  assert.deepEqual(retry.receipt.changed_files, ['src/app.js']);
  await finalizeDeployReceipt({ root, status: 'success', deploymentId: 'dep_3' });
  const settled = await captureDeployReceipt({ root, project: 'fixture' });
  assert.deepEqual(settled.receipt.diff_stats, { unchanged: 1, modified: 0, added: 0, removed: 0 });
  assert.deepEqual(settled.receipt.changed_files, []);
});

test('deploy-receipt CLI emits machine-readable capture/finalize/show receipts', async (t) => {
  const root = await fixture(t);
  const capture = run(['capture', '.', '--project', 'cli-fixture', '--json'], root);
  assert.equal(capture.status, 0, capture.stderr);
  const captured = JSON.parse(capture.stdout);
  assert.equal(captured.format, 'agentsam-deploy-merkle');
  assert.equal(captured.project, 'cli-fixture');
  assert.equal(captured.status, 'captured');

  const success = run(['success', '.', '--deployment-id', 'dep_cli', '--worker-version', 'worker_v1', '--json'], root);
  assert.equal(success.status, 0, success.stderr);
  const finalized = JSON.parse(success.stdout);
  assert.equal(finalized.status, 'success');
  assert.equal(finalized.deployment_id, 'dep_cli');
  assert.equal(finalized.worker_version_id, 'worker_v1');

  const show = run(['show', '.', '--json'], root);
  assert.equal(show.status, 0, show.stderr);
  assert.equal(JSON.parse(show.stdout).root_hash, finalized.root_hash);
});
