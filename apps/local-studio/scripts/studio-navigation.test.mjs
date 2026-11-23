import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { studioNavigationProjection } from './studio-navigation.mjs';

test('navigation exposes configured installations only and preserves product identity from manifests', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'agentsam-navigation-'));
  try {
    for (const [id, name, version] of [['local-studio', 'Custom host', '9.0.0'], ['cad-creator', 'CAD product', '4.2.1'], ['moviemode', 'Excluded product', '1.0.0']]) {
      const folder = path.join(root, 'apps', id);
      mkdirSync(folder, { recursive: true });
      writeFileSync(path.join(folder, 'agentsam.app.json'), JSON.stringify({ schema:'agentsam.app.v1', kind:'app', id, name, version, package: '@example/' + id }));
    }
    const host = path.join(root, 'host.json');
    writeFileSync(host, JSON.stringify({ app_id: 'local-studio', included_apps: ['cad-creator'] }));
    const projection = studioNavigationProjection({ repoRoot: root, manifestPath: host });
    assert.deepEqual(projection.apps.map((app) => app.id), ['local-studio', 'cad-creator']);
    assert.equal(projection.apps[1].name, 'CAD product');
    assert.equal(projection.apps[1].version, '4.2.1');
    assert.equal(projection.apps[1].href, '/admin/cad');
    assert.deepEqual(projection.primary.map((item) => item.id), ['home', 'media', 'analytics', 'tickets']);
    assert.equal(projection.channels.length, 0, 'A host without Ecommerce must not advertise Online Store');
    assert.equal(projection.primary.find((item) => item.id === 'media')?.href, '/admin/media');
    assert.deepEqual(projection.utilities, [], 'Utilities remain under Settings/account instead of global navigation');
    writeFileSync(host, JSON.stringify({ app_id: 'local-studio', included_apps: ['missing-app'] }));
    assert.throws(() => studioNavigationProjection({ repoRoot: root, manifestPath: host }), /has no manifest: missing-app/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('global React shell renders primary business destinations before sales channels and installed apps', () => {
  const shell = readFileSync(new URL('../frontend/agentsam/AgentSamShell.tsx', import.meta.url), 'utf8');
  const primary = shell.indexOf('...(navigation.primary || []).filter(');
  const channels = shell.indexOf("...(navigation.channels?.length ? [{id:'sales-channels'");
  const apps = shell.indexOf("{id:'installed-apps',label:'Apps'");
  assert.ok(primary >= 0, 'the primary navigation projection must be rendered');
  assert.ok(channels > primary, 'sales channels must follow primary destinations');
  assert.ok(apps > channels, 'installed apps must follow sales channels');
  const projection = readFileSync(new URL('./studio-navigation.mjs', import.meta.url), 'utf8');
  assert.match(projection, /id:'media',label:'Library',href:'\/admin\/media',icon:'library'/);
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

test('one Products route with Create and bundled Completeful discovered from manifest', () => {
  const data = studioNavigationProjection();
  const products = data.channels.find(item => item.id === 'products');
  assert.equal(products?.href, '/admin/products');
  assert.equal(products?.children.filter(item=>item.href === products.href).length, 0);
  assert.equal(products?.children.find(item=>item.id === 'create')?.label, 'Create');
  assert.equal(data.primary.find(item=>item.id === 'media')?.label, 'Library');
  const supplier = data.apps.find(item=>item.id === 'completeful');
  assert.equal(supplier, undefined, 'Completeful is a provider integration, not a separately installed app');
  assert.ok(data.channels.find(item => item.id === 'audience')?.children.some(item => item.id === 'growth'));
});


test('mobile global header uses one navigation bubble and two AgentSam contextual actions', () => {
  const host = readFileSync(new URL('../frontend/public/admin/host-config.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../frontend/agentsam/shared-nav-host.css', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../frontend/agentsam/AgentSamPage.tsx', import.meta.url), 'utf8');
  const pageCss = readFileSync(new URL('../frontend/agentsam/shell.css', import.meta.url), 'utf8');
  const nav = readFileSync(new URL('../../../packages/agentsam-nav/src/Surfaces.tsx', import.meta.url), 'utf8');

  assert.match(host, /data-shared-nav-toggle/, 'single global navigation trigger stays owned by hosted shell');
  assert.match(css, /body\.agentsam-shared-navigation \.console-topbar \{\s*background: var\(--c-bg\);\s*border-bottom: 0;/);
  assert.match(css, /\[data-shared-nav-toggle\] \{[^}]*aspect-ratio: 1;/s, 'mobile leading control is a circular bubble');
  assert.match(page, /hostLeadingSlot && !isMobile \? createPortal\(leadingControls/, 'mobile does not suppress the global host nav toggle with an empty portal');
  assert.match(page, /const headerActions = isMobile \? <div/, 'responsive AgentSam trailing actions are explicitly separated from desktop browser toolbar');
  assert.match(page, /className="agentsam-mobile-header-action-pill"/);
  assert.match(page, /label="New chat" hint="New chat \(⌘N\)"/);
  assert.match(page, /<Nav\.OverflowMenu id="agentsam-start-actions" label="More options" actions=\{mobileMoreActions\}/);
  assert.match(page, /<Nav\.ConversationActions additionalActions=\{mobileMoreActions\}/);
  assert.match(pageCss, /\.agentsam-mobile-header-action-pill \{[^}]*border-radius: 999px/s);
  assert.match(nav, /additionalActions\.forEach/, 'More retains existing conversation actions while adding browser and annotation commands');
  assert.match(page, /id: 'annotate-page'/);
  assert.match(page, /id: 'new-browser-tab'/);
  assert.match(page, /id: 'assistant'/);
  assert.match(page, /id: 'pinned-resources'/);
  assert.match(page, /\.\.\.\(pinned\.outputActions \|\| \[\]\)/);
  assert.match(page, /\.\.\.\(pinned\.sourceActions \|\| \[\]\)/);
});
