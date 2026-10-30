import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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
    const products = projection.primary.find((item) => item.id === 'products');
    assert.equal(products.href, '/admin/products');
    const productLinks = new Map(products.children.map((item) => [item.id, item.href]));
    assert.equal(productLinks.get('product-studio'), '/admin/products/create');
    assert.equal(productLinks.get('store-products'), '/admin/products?view=store');
    assert.equal(productLinks.get('collections'), '/admin/products?view=collections');
    assert.equal(productLinks.get('platform-products'), '/admin/products?view=platform');
    assert.equal(productLinks.get('artwork-help'), '/admin/products/help/artwork');
    assert.equal(projection.channels.length, 0, 'A host without Ecommerce must not advertise Online Store');
    assert.deepEqual(projection.utilities, [], 'Utilities remain under Settings/account instead of global navigation');
    writeFileSync(host, JSON.stringify({ app_id: 'local-studio', included_apps: ['missing-app'] }));
    assert.throws(() => studioNavigationProjection({ repoRoot: root, manifestPath: host }), /has no manifest: missing-app/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
