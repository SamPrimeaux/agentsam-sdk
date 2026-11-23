import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listAppManifests } from '../../packages/agentsam-desktop-shell/scripts/app-discovery.mjs';
import { canonicalStudioPath } from '../../apps/local-studio/shared/studio-admin-routes.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const load = (p) => JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));

test('all real APP manifests have stable IDs and package version parity', () => {
  const apps = listAppManifests(root);
  const ids = apps.map(x=>x.id);
  assert.deepEqual([...ids].sort(), [
    'cad-creator','design-canvas','ecommerce-cms-agentsam',
    'goalguru','local-studio','moviemode','samsketch',
  ], 'unexpected APP discovery: inspect whether a new manifest represents an installable product');
  for (const app of apps) {
    assert.equal(app.manifest.schema, 'agentsam.app.v1');
    assert.equal(app.manifest.kind, 'app');
    assert.equal(app.manifest.id, app.id);
    assert.ok(app.manifest.version, app.id + ' missing version');
    const pkgPath = path.join(app.dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath,'utf8'));
      assert.equal(app.manifest.version, pkg.version, app.id + ' version drift');
      assert.equal(app.manifest.package, pkg.name, app.id + ' package namespace drift');
    }
  }
});

test('nested plugins and modules have package contracts, not independent APP identities', () => {
  for (const [relative,kind,owner] of [
    ['apps/samspeaks','module','moviemode'],
    ['apps/local-studio/apps/agentsamforms','module','ecommerce-cms-agentsam'],
    ['apps/ecommerce-cms-agentsam/apps/product-studio','module','ecommerce-cms-agentsam'],
    ['apps/ecommerce-cms-agentsam/apps/growth','module','ecommerce-cms-agentsam'],
    ['apps/ecommerce-cms-agentsam/apps/completeful','provider','ecommerce-cms-agentsam'],
    ['apps/ecommerce-cms-agentsam/apps/resend','provider','ecommerce-cms-agentsam'],
  ]) {
    assert.ok(!fs.existsSync(path.join(root,relative,'agentsam.app.json')), relative + ' must not masquerade as an APP');
    const d=load(relative+'/agentsam.package.json');
    assert.equal(d.schema,'agentsam.package.v1');
    assert.equal(d.kind,kind);
    assert.equal(d.owner_app_id,owner);
    assert.equal(d.installable,false);
  }
  assert.ok(!fs.existsSync(path.join(root, 'packages/agentsam-database-editor/agentsam.app.json')));
  assert.ok(!fs.existsSync(path.join(root, 'apps/ecommerce-cms-agentsam/packages/agentsam-workbench/agentsam.app.json')));
});

test('desktop bundle stages owned modules but never counts them as Apps installations', () => {
  const brand=load('packages/agentsam-desktop-shell/manifests/local-studio.json');
  assert.ok(brand.included_apps.includes('moviemode'));
  assert.ok(!brand.included_apps.includes('samspeaks'));
  assert.ok(!brand.included_apps.includes('agentsam-copro-studio'));
  assert.equal(brand.included_modules.length,1);
  assert.equal(brand.included_modules[0].owner_app_id,'moviemode');
  assert.equal(brand.app_catalog.scope,'verified_account');
  assert.equal(brand.app_catalog.failed_inventory_is_not_zero,true);
});

test('all eight existing production installation routes have a host-supported path', () => {
  const launchUrls=[
    '/forms','/admin/cad','/database','/admin/design-canvas',
    '/admin/store','/goalguru','/admin/moviemode','/admin/samsketch',
  ];
  for (const url of launchUrls) {
    const normalized=canonicalStudioPath(url)||url;
    assert.match(normalized,/^\/admin\//);
  }
  assert.equal(canonicalStudioPath('/admin/design-canvas'), '/admin/canvas');
});
