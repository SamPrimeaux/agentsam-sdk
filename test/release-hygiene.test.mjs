import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('release metadata is independently valid and public terminal vocabulary is aligned', () => {
  const manifest = read('agentsam.yaml');
  const readme = read('README.md');
  // Published/approved metadata may lag development source. Cross-package
  // version equality is not a prerequisite to verifying CLI behavior.
  assert.match(manifest, /packages:[\s\S]*?root_sdk:[\s\S]*?version: "\d+\.\d+\.\d+[^"]*"/);
  assert.match(manifest, /release:[\s\S]*?root_sdk:[\s\S]*?target_version: "\d+\.\d+\.\d+[^"]*"/);
  assert.match(manifest, /state: (candidate|published)/);
  assert.match(manifest, /current_latest: "\d+\.\d+\.\d+"/);
  assert.match(manifest, /verification_command: npm run verify:release/);
  // Bare `agentsam` is the terminal home; the desktop app is `agentsam open`.
  // There is no separate `tui` command to keep in sync.
  assert.match(manifest, /^\s*- open\s*$/m);
  assert.doesNotMatch(manifest, /^\s*- tui\s*$/m);
  assert.match(read('src/cli.js'), /await runTuiCommand\(\);/);
  assert.doesNotMatch(read('src/cli.js'), /command === 'tui'/);
  assert.match(read('src/cli/command-catalog.js'), /id: 'open'/);
  assert.doesNotMatch(readme, /CLI\/TUI/);
});

test('dead branded splash paths are gone and UI preview stays dev-only', () => {
  for (const rel of ['src/ui/splash.js', 'src/ui/splash-xterm.js', 'src/commands/tui.js']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} should not ship`);
  }
  for (const rel of ['scripts/internal/ui-preview-runner.mjs', 'scripts/internal/ansi-ui-preview.mjs']) {
    assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should remain available to contributors`);
  }
  assert.equal(fs.existsSync(path.join(root, 'src/ui/runtime-activity.js')), true, 'automatic runtime activity must ship with the product CLI');

  const pkg = JSON.parse(read('package.json'));
  for (const rel of [
    'skills/catalog.json',
    'skills/agentsam-app-fundamentals',
    'skills/agentsam-cloudflare-workers',
    'skills/agentsam-codebaseindex',
    'skills/agentsam-jr-dev',
    'skills/agentsam-progression-guard',
  ]) {
    assert.ok(pkg.files.includes(rel), 'curated portable skill payload must include ' + rel);
  }
  assert.equal(pkg.files.includes('skills'), false, 'root package must not publish every donor skill');
  assert.equal(pkg.files.includes('test'), false, 'contributor tests must not be published');
  assert.equal(pkg.files.includes('scripts'), false, 'internal preview scripts must not be published');
});
