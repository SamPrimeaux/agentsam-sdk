import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { brandScan, brandResolve } from '../src/index.js';
import { repositorySnapshot } from '../../../src/capabilities/index.js';
import { scanTrustBoundary } from '../../../src/security/trust-boundary.js';
import { suggestNextActions, routeDeterministicIntent } from '../../../src/progression/index.js';

function fixtureRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-brand-'));
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: root, stdio: 'ignore' });
  fs.writeFileSync(path.join(root, '.gitignore'), 'ignored/\nnode_modules/\n');
  fs.mkdirSync(path.join(root, 'src/styles'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/components'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public/brand'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'ignored'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/styles/theme.css'),
    `:root {\n  --color-slate-950: #0f172a;\n  --black: #111111;\n  color: #101010;\n  background: rgb(17, 17, 17);\n  font-family: "Inter", system-ui;\n  font-size: 16px;\n  border-radius: 8px;\n}\n`,
  );
  fs.writeFileSync(
    path.join(root, 'src/components/Button.tsx'),
    `export function Button() { return <button className="bg-neutral-950 text-white">Go</button>; }\n`,
  );
  fs.writeFileSync(
    path.join(root, 'src/components/Header.tsx'),
    `export function Header() { return <header style={{ background: '#0f172a' }}>Nav</header>; }\n`,
  );
  fs.writeFileSync(path.join(root, 'public/brand/inneranimal-logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  fs.writeFileSync(path.join(root, 'public/brand/brand-font.woff2'), 'font-bytes');
  fs.writeFileSync(path.join(root, 'public/brand/identity-guide.pdf'), '%PDF-1.4');
  fs.writeFileSync(path.join(root, 'public/brand/brand-loop.mp4'), 'video-bytes');
  fs.writeFileSync(path.join(root, 'public/brand/brand-scene.glb'), 'glb-bytes');
  fs.writeFileSync(path.join(root, 'public/brand/brand-kit.zip'), 'zip-bytes');
  fs.writeFileSync(path.join(root, 'docs/brand-guidelines.docx'), 'docx-bytes');
  fs.writeFileSync(path.join(root, 'ignored/secret.css'), `:root { --should-not-see: #ff0000; }\n`);
  execFileSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: root, stdio: 'ignore' });
  return root;
}

test('brand.scan derives stable brand evidence from repository snapshot', async (t) => {
  const root = fixtureRepo();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const snapshot = await repositorySnapshot({ cwd: root, churnDays: 30 });
  const one = await brandScan({ cwd: root, snapshot });
  const two = await brandScan({ cwd: root, snapshot });

  assert.equal(one.capability, 'brand.scan');
  assert.equal(one.deterministic, true);
  assert.equal(one.model_required, false);
  assert.equal(one.repository.snapshot_id, snapshot.snapshot_id);
  assert.equal(one.repository.snapshot_id, two.repository.snapshot_id);
  assert.match(one.content_hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(one.content_hash, two.content_hash);
  assert.deepEqual(one.tokens.colors.map((c) => c.normalized_value), two.tokens.colors.map((c) => c.normalized_value));
  assert.ok(one.tokens.colors.length >= 2);
  assert.equal(one.sources.css >= 1, true);
  assert.ok(one.assets.items.some((asset) => asset.path === 'public/brand/inneranimal-logo.svg'));
  assert.ok(one.assets.items.some((asset) => asset.path === 'public/brand/brand-font.woff2'));
  assert.ok(one.assets.items.some((asset) => asset.path === 'public/brand/identity-guide.pdf'));
  assert.ok(one.assets.items.some((asset) => asset.path === 'public/brand/brand-loop.mp4'));
  assert.ok(one.assets.items.some((asset) => asset.path === 'public/brand/brand-scene.glb'));
  assert.ok(one.assets.items.some((asset) => asset.path === 'public/brand/brand-kit.zip'));
  assert.ok(one.assets.items.some((asset) => asset.path === 'docs/brand-guidelines.docx'));
  assert.equal(one.assets.items.find((asset) => asset.path === 'public/brand/brand-font.woff2').role, 'type.body');
  assert.equal(one.assets.items.find((asset) => asset.path === 'public/brand/brand-kit.zip').role, 'source.archive');
  assert.equal(one.assets.items.find((asset) => asset.path === 'public/brand/inneranimal-logo.svg').capabilities.operations.preview, true);
  assert.equal(one.assets.items.find((asset) => asset.path === 'public/brand/brand-font.woff2').capabilities.operations.edit, false);
  assert.equal(one.assets.items.find((asset) => asset.path === 'public/brand/identity-guide.pdf').capabilities.operations.inspect, false);
  assert.equal(one.assets.items.find((asset) => asset.path === 'public/brand/brand-kit.zip').capabilities.operations.inspect, true);
});

test('brand scan and repository inspection share one file authority', async (t) => {
  const root = fixtureRepo();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const snapshot = await repositorySnapshot({ cwd: root, churnDays: 30 });
  const boundary = await scanTrustBoundary(root);
  const brand = await brandScan({ cwd: root, snapshot });

  assert.equal(snapshot.tree.merkle_root, boundary.merkle_root);
  assert.equal(snapshot.tree.metadata_root, boundary.metadata_root);
  assert.equal(brand.repository.merkle_root, snapshot.tree.merkle_root);
  assert.equal(brand.repository.path_count, snapshot.tree.paths.length);
  assert.equal(snapshot.tree.paths.some((p) => p.startsWith('ignored/')), false);
  assert.equal(
    JSON.stringify(brand).includes('should-not-see') || JSON.stringify(brand).includes('#ff0000'),
    false,
  );
});

test('brand.resolve keeps observed/inferred/declared/resolved separated', async (t) => {
  const root = fixtureRepo();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const snapshot = await repositorySnapshot({ cwd: root, churnDays: 30 });
  const scan = await brandScan({ cwd: root, snapshot });
  const resolved = brandResolve(scan);
  assert.equal(resolved.capability, 'brand.resolve');
  assert.ok(Array.isArray(resolved.observed.colors));
  assert.equal(typeof resolved.inferred.colors, 'object');
  assert.deepEqual(resolved.declared, {});
  assert.equal(typeof resolved.resolved.colors, 'object');
});

test('progression engine suggests brand next actions without a model', () => {
  const { next_actions } = suggestNextActions({
    capability: 'brand.scan',
    result: { conflicts: [{ kind: 'near_duplicate_color' }], complete: true },
  });
  assert.ok(next_actions.some((a) => a.id === 'brand.inspect.conflicts'));
  assert.ok(next_actions.some((a) => a.command?.includes('plan brand')));
  assert.equal(next_actions.every((a) => a.requires_model === false), true);
});

test('deterministic intent router handles what next without a model', () => {
  const hit = routeDeterministicIntent('what should I do next?');
  assert.equal(hit.intent, 'next');
  assert.equal(hit.use_progression, true);
  assert.equal(routeDeterministicIntent('show brand').command, 'agentsam brand');
});
