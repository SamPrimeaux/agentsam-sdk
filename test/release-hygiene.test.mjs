import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('2.5 release metadata and public terminal vocabulary are aligned', () => {
  const pkg = JSON.parse(read('package.json'));
  const manifest = read('agentsam.yaml');
  const readme = read('README.md');

  assert.equal(pkg.version, '2.5.0');
  assert.match(manifest, /target_version: "2\.5\.0"/);
  assert.match(manifest, /state: release_candidate/);
  assert.match(manifest, /current_latest: "2\.4\.1"/);
  assert.doesNotMatch(manifest, /^\s*- tui\s*$/m);
  assert.doesNotMatch(readme, /agentsam tui|CLI\/TUI/);
});

test('dead branded splash paths are gone and UI preview stays dev-only', () => {
  for (const rel of ['src/ui/splash.js', 'src/ui/splash-xterm.js', 'src/commands/tui.js']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} should not ship`);
  }
  for (const rel of ['scripts/internal/ui-preview-runner.mjs', 'scripts/internal/ansi-ui-preview.mjs']) {
    assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should remain available to contributors`);
  }

  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.files.includes('skills'));
  assert.equal(pkg.files.includes('scripts'), false, 'internal preview scripts must not be published');
});
