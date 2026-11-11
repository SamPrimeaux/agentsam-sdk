import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { studioNavigationProjection } from './studio-navigation.mjs';

test('navigation exposes configured installations only and preserves product identity from manifests', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'agentsam-navigation-'));
  try {
    for (const [id, name, version] of [['local-studio', 'Custom host', '9.0.0'], ['cad-creator', 'CAD product', '4.2.1'], ['agentsam-copro-studio', 'Excluded product', '1.0.0']]) {
      const folder = path.join(root, 'apps', id);
      mkdirSync(folder, { recursive: true });
      writeFileSync(path.join(folder, 'agentsam.app.json'), JSON.stringify({ id, name, version, package: '@example/' + id }));
    }
    const host = path.join(root, 'host.json');
    writeFileSync(host, JSON.stringify({ app_id: 'local-studio', included_apps: ['cad-creator'] }));
    const projection = studioNavigationProjection({ repoRoot: root, manifestPath: host });
    assert.deepEqual(projection.apps.map((app) => app.id), ['local-studio', 'cad-creator']);
    assert.equal(projection.apps[1].name, 'CAD product');
    assert.equal(projection.apps[1].version, '4.2.1');
    assert.equal(projection.apps[1].href, '/admin/cad');
    assert.deepEqual(projection.primary.map((item) => item.id), ['home', 'projects', 'media', 'analytics', 'tickets']);
    assert.equal(projection.channels.length, 0, 'A host without Ecommerce must not advertise Online Store');
    assert.equal(projection.primary.find((item) => item.id === 'media')?.href, '/media');
    assert.deepEqual(projection.utilities, [], 'Utilities remain under Settings/account instead of global navigation');
    writeFileSync(host, JSON.stringify({ app_id: 'local-studio', included_apps: ['missing-app'] }));
    assert.throws(() => studioNavigationProjection({ repoRoot: root, manifestPath: host }), /has no manifest: missing-app/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('global React shell renders primary business destinations before sales channels and installed apps', () => {
  const shell = readFileSync(new URL('../frontend/agentsam/AgentSamShell.tsx', import.meta.url), 'utf8');
  const primary = shell.indexOf('...(navigation.primary || []).map(');
  const channels = shell.indexOf("...(navigation.channels?.length ? [{id:'sales-channels'");
  const apps = shell.indexOf("...(navigation.apps?.length ? [{id:'installed-apps'");
  assert.ok(primary >= 0, 'the primary navigation projection must be rendered');
  assert.ok(channels > primary, 'sales channels must follow primary destinations');
  assert.ok(apps > channels, 'installed apps must follow sales channels');
  const projection = readFileSync(new URL('./studio-navigation.mjs', import.meta.url), 'utf8');
  assert.match(projection, /id:'media',label:'Media',href:'\/media',icon:'content'/);
  // Settings owns Documentation; Help is not a global destination.
  assert.doesNotMatch(projection, /id:'help'/);
  assert.match(projection, /id:'inventory',label:'Inventory',href:'\/admin\/inventory'/);
});

test('Ecommerce shell.js legacy rail is replaced by agentsam-nav without a second-nav flash', async () => {
  const { readFile } = await import('node:fs/promises');
  const host = await readFile(new URL('../frontend/public/admin/host-config.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../frontend/agentsam/shared-nav-host.css', import.meta.url), 'utf8');
  assert.match(host, /legacyRail\.replaceChildren\(\)/, 'legacy rail is emptied synchronously after renderShell');
  assert.match(host, /data-shared-nav-pending/, 'rail is reserved while agentsam-nav loads');
  assert.match(host, /originalHydrateNav\(window\.__shellUser, active\)/, 'packaged rail restores only if shared navigation fails to load');
  assert.match(css, /\[data-shared-nav-pending\]\s*\{\s*visibility:hidden/);
});
