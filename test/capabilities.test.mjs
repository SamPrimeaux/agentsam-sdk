import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getCapability, getCapabilityManifest, repositorySnapshot } from '../src/capabilities/index.js';
import { getPreset, resolvePreset } from '../src/presets/index.js';

const CLI = path.resolve('src/cli.js');

function git(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-capability-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'snapshot-fixture', version: '1.0.0', type: 'module' }, null, 2));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'index.js'), 'export const value = 1;\n');
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'AgentSam Test']);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'fixture']);
  return root;
}

test('capability manifest exposes deterministic primitives without requiring a model', () => {
  const manifest = getCapabilityManifest();
  assert.equal(manifest.schema_version, 1);
  assert.equal(getCapability('repository.snapshot').model_required, false);
  assert.equal(getCapability('repository.snapshot').side_effects, 'none');
  assert.equal(getCapability('knowledge.index').deterministic, true);
});

test('presets resolve to explicit feature/capability selections', () => {
  assert.equal(getPreset('cms').lane, 'cms');
  const preset = resolvePreset('prototype');
  assert.deepEqual(preset.features, ['agent']);
  assert.throws(() => resolvePreset('nope'), /unknown_preset/);
});

test('repository.snapshot composes deterministic evidence and content addressing', async t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const one = await repositorySnapshot({ cwd: root, churnDays: 30 });
  const two = await repositorySnapshot({ cwd: root, churnDays: 30 });
  assert.equal(one.capability, 'repository.snapshot');
  assert.match(one.snapshot_id, /^rsnap_[a-f0-9]{24}$/);
  assert.match(one.content_hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(one.content_hash, two.content_hash);
  assert.equal(one.snapshot_id, two.snapshot_id);
  assert.equal(one.repository.revision_sha, git(root, ['rev-parse', 'HEAD']));
  assert.ok(one.tree.merkle_root);
  assert.match(one.tree.metadata_root, /^sha256:[a-f0-9]{64}$/);
  assert.equal(one.tree.manifest.format, 'agentsam-merkle');
  assert.equal(one.tree.manifest.version, 1);
  assert.equal(one.tree.manifest.hash_algorithm, 'sha256');
  assert.match(one.tree.manifest.policy_hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(one.tree.classifier.format, 'agentsam-filemeta');
  assert.equal(one.tree.classifier.version, 1);
  const source = one.tree.files.find((entry) => entry.path === 'src/index.js');
  assert.equal(source.mode, 420);
  assert.equal(source.system, 'snapshot-fixture');
  assert.equal(source.language, 'javascript');
  assert.deepEqual(source.symbols, ['value']);
  assert.ok(one.intelligence.summary.file_count >= 2);
  assert.equal(one.packages[0].name, 'snapshot-fixture');
  assert.equal(one.knowledge.configured, false);
});

test('product UX creates a preset project, adds a feature, and inspects before first commit', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-product-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  execFileSync(process.execPath, [CLI, 'create', 'demo', '--preset', 'cms', '--target', 'local'], {
    cwd: parent,
    stdio: 'pipe',
  });
  const project = path.join(parent, 'demo');
  const config = JSON.parse(fs.readFileSync(path.join(project, '.agentsam', 'config.json'), 'utf8'));
  assert.equal(config.preset, 'cms');
  assert.equal(config.lane, 'cms');
  assert.deepEqual(config.features, ['cms', 'knowledge']);
  assert.ok(config.capabilities.includes('repository.snapshot'));

  execFileSync(process.execPath, [CLI, 'add', 'knowledge', '--cwd', project, '--json'], { stdio: 'pipe' });
  const features = JSON.parse(fs.readFileSync(path.join(project, '.agentsam', 'features.json'), 'utf8'));
  assert.equal(features.features.knowledge.selected, true);

  const snapshot = JSON.parse(execFileSync(process.execPath, [CLI, 'inspect', '--cwd', project, '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
  assert.equal(snapshot.capability, 'repository.snapshot');
  assert.equal(snapshot.repository.revision_sha, null);
  assert.ok(snapshot.tree.stats.files > 0);
});
