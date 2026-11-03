import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const shellRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scripts = JSON.parse(readFileSync(path.join(shellRoot, 'package.json'), 'utf8')).scripts;
const manifest = JSON.parse(readFileSync(path.join(shellRoot, 'manifests/local-studio.json'), 'utf8'));

test('desktop builds always rebuild every manifest-included application before building the host', () => {
  const command = scripts['build:desktop-assets'];
  assert.ok(manifest.included_apps?.length >= 4, 'expected real included application contracts');
  assert.match(command, /npm --prefix \.\.\/\.\.\/apps\/local-studio run build:included:all/);
  assert.match(command, /run build:desktop/);
  assert.ok(command.indexOf('build:included:all') < command.indexOf('build:desktop'),
    'included applications must rebuild before the desktop host');
  assert.ok(command.indexOf('build:desktop') < command.indexOf('sync-local-studio-dist'),
    'desktop assets must be synchronized only after the host build');
});

test('both installable bundles depend on the full mandatory desktop asset pipeline', () => {
  for (const name of ['bundle', 'bundle:app']) {
    assert.match(scripts[name], /npm run build:desktop-assets/, name);
    assert.ok(scripts[name].indexOf('npm run build:desktop-assets') < scripts[name].indexOf('tauri build'), name);
  }
  assert.match(scripts.build, /npm run build:desktop-assets/);
});

test('legacy shell-only installer bypass explicitly refuses to produce an artifact', async () => {
  assert.match(scripts['bundle:shell-only'], /deny-stale-desktop-bundle\.mjs/);
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, [path.join(shellRoot, 'scripts/deny-stale-desktop-bundle.mjs')], {
    cwd: shellRoot,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /stale.*assets|stale.*CAD/i);
});
