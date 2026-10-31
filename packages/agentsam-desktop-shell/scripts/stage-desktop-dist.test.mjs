import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stageDesktopArtifact, validateDesktopArtifact } from './stage-desktop-dist.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agentsam-desktop-stage-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'product-build');
  const destination = path.join(root, 'shell', 'dist');
  mkdirSync(path.join(source, 'assets'), { recursive: true });
  mkdirSync(destination, { recursive: true });
  writeFileSync(path.join(source, 'index.html'), '<div id="root"></div><script type="module" src="./assets/app.js"></script><link rel="stylesheet" href="./assets/app.css">');
  writeFileSync(path.join(source, 'assets/app.js'), 'document.getElementById("root").textContent="Product";');
  writeFileSync(path.join(source, 'assets/app.css'), 'body{margin:0}');
  writeFileSync(path.join(destination, 'known-good.txt'), 'last working build');
  const options = { source, destination, repoRoot: root, manifest: { app_id: 'movie-editor', version: '1.0.0' } };
  return { root, source, destination, options };
}
function assertPriorBuild(f) {
  assert.equal(readFileSync(path.join(f.destination, 'known-good.txt'), 'utf8'), 'last working build');
}
test('same staging pipeline uses the existing manifest identity and portable content provenance', (t) => {
  const f = fixture(t);
  const receipt = stageDesktopArtifact(f.options);
  assert.equal(receipt.product, 'movie-editor');
  assert.equal(receipt.source, 'product-build');
  assert.equal(receipt.sdk_version, '1.0.0');
  assert.deepEqual(receipt.artifact.entrypoints, ['assets/app.js']);
  assert.equal(receipt.artifact.files.length, 3);
  assert.match(receipt.artifact.content_sha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.artifact.content_sha256, validateDesktopArtifact(f.destination).contentHash);
  assert.equal(JSON.stringify(receipt).includes(f.root), false);
  assert.equal(existsSync(path.join(f.destination, 'known-good.txt')), false);
  assert.deepEqual(readdirSync(path.dirname(f.destination)), ['dist']);
});
test('content hash is stable across staging dates and changes with source bytes', (t) => {
  const f = fixture(t);
  const first = stageDesktopArtifact({ ...f.options, now: new Date('2026-01-01') });
  const second = stageDesktopArtifact({ ...f.options, now: new Date('2026-02-01') });
  assert.equal(first.artifact.content_sha256, second.artifact.content_sha256);
  writeFileSync(path.join(f.source, 'assets/app.css'), 'body{margin:1px}');
  const third = stageDesktopArtifact(f.options);
  assert.notEqual(third.artifact.content_sha256, first.artifact.content_sha256);
});
test('missing build or missing entry does not replace the prior installable assets', (t) => {
  const f = fixture(t);
  assert.throws(() => stageDesktopArtifact({ ...f.options, source: path.join(f.root, 'missing') }), /missing or unsafe/);
  assertPriorBuild(f);
  rmSync(path.join(f.source, 'index.html'));
  assert.throws(() => stageDesktopArtifact(f.options), /index.html is missing/);
  assertPriorBuild(f);
});
test('hydrate-only client is rejected before destination replacement', (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.source, 'assets/app.js'), 'hydrateRoot(document, app);');
  assert.throws(() => stageDesktopArtifact(f.options), /hydrate-only/);
  assertPriorBuild(f);
});
test('entry asset traversal, missing chunks, and remote scripts fail closed', (t) => {
  const f = fixture(t);
  for (const asset of ['../outside.js', './assets/missing.js', 'https://example.test/app.js']) {
    writeFileSync(path.join(f.source, 'index.html'), '<script type="module" src="' + asset + '"></script>');
    assert.throws(() => stageDesktopArtifact(f.options), /unsafe|bundled assets/);
    assertPriorBuild(f);
  }
});
test('missing directly referenced stylesheet fails before replacing previous build', (t) => {
  const f = fixture(t);
  rmSync(path.join(f.source, 'assets/app.css'));
  assert.throws(() => stageDesktopArtifact(f.options), /Missing or unsafe/);
  assertPriorBuild(f);
});
test('overlapping directories and symlink artifacts cannot overwrite source or escape the build', (t) => {
  const f = fixture(t);
  assert.throws(() => stageDesktopArtifact({ ...f.options, destination: f.source }), /disjoint/);
  assert.throws(() => stageDesktopArtifact({ ...f.options, destination: path.join(f.source, 'dist') }), /disjoint/);
  assert.throws(() => stageDesktopArtifact({ ...f.options, destination: f.root }), /disjoint/);
  symlinkSync(path.join(f.destination, 'known-good.txt'), path.join(f.source, 'linked.txt'));
  assert.throws(() => stageDesktopArtifact(f.options), /symlinks/);
  assertPriorBuild(f);
});
test('product identity is required rather than inferred from a build directory', (t) => {
  const f = fixture(t);
  assert.throws(() => stageDesktopArtifact({ ...f.options, manifest: {} }), /app_id/);
  assertPriorBuild(f);
});

test('the existing Local Studio sync command executes the shared verified stage', (t) => {
  const f = fixture(t);
  const script = fileURLToPath(new URL('./sync-local-studio-dist.mjs', import.meta.url));
  const output = execFileSync(process.execPath, [script, '--source', f.source, '--destination', f.destination], { encoding: 'utf8' });
  assert.match(output, /local-studio · 3 verified files/);
  const receipt = JSON.parse(readFileSync(path.join(f.destination, 'agentsam-desktop-dist.json'), 'utf8'));
  assert.equal(receipt.product, 'local-studio');
  assert.equal(receipt.artifact.content_sha256, validateDesktopArtifact(f.source).contentHash);
});
test('selecting another product manifest requires an explicit product build', (t) => {
  const f = fixture(t);
  const manifestPath = path.join(f.root, 'brand.json');
  writeFileSync(manifestPath, JSON.stringify(f.options.manifest));
  const script = fileURLToPath(new URL('./sync-local-studio-dist.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--manifest', manifestPath, '--destination', f.destination], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--source is required/);
  assertPriorBuild(f);
});
