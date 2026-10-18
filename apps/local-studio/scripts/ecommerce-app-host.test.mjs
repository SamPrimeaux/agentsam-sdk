import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_ROUTE_MANIFEST } from '../../ecommerce-cms-agentsam/backend/lib/route-manifest.js';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(studio, '../..');
const appId = 'ecommerce-cms-agentsam';
const desktop = JSON.parse(fs.readFileSync(path.join(repo, 'packages/agentsam-desktop-shell/manifests/local-studio.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'apps', appId, 'agentsam.app.json'), 'utf8'));
const paths = [
  '/admin/home',
  '/admin/store',
  '/admin/orders',
  '/admin/products/create',
  '/admin/products/help/artwork',
  '/admin/products',
  '/admin/product-edit?id=prod_24614bd933a3f255',
  '/admin/inventory',
  '/admin/subscribers',
  '/admin/growth',
  '/admin/content',
  '/admin/analytics/overview',
  '/admin/analytics/finance',
  '/admin/analytics/health',
  '/admin/theme-editor?slug=home',
  '/admin/pages',
  '/admin/preferences',
];

test('complete Ecommerce app registers beside CAD in existing Local Studio Apps', () => {
  assert.ok(desktop.included_apps.includes(appId));
  assert.ok(desktop.included_apps.includes('cad-creator'));
  assert.equal(manifest.embed.stage, appId);
  assert.equal(manifest.embed.build.output, 'dist/assets');
  assert.equal(manifest.context.route_authority, 'backend/lib/route-manifest.js');
  assert.equal(manifest.surfaces.admin.mount, '/admin');
});

test('requested real admin routes belong to the existing product route authority', () => {
  const templates = ADMIN_ROUTE_MANIFEST.map(x => x.path);
  for (const href of paths) {
    assert.ok(templates.includes(href.split('?')[0]), 'missing canonical admin route: ' + href);
  }
});

test('Studio launches only supported product routes; no duplicate AgentSam or unfinished POS/Markets', async () => {
  const result = await build({
    entryPoints: [path.join(studio, 'frontend/src/lib/apps/ecommerce-routing.ts')],
    bundle: true, platform: 'node', format: 'esm', target: 'node22', write: false,
    plugins: [{ name: 'real-ecommerce-routes', setup(ctx) {
      ctx.onResolve({ filter: /^@inneranimalmedia\/ecommerce-cms-agentsam\/backend\/routes$/ }, () => ({
        path: path.join(repo, 'apps/ecommerce-cms-agentsam/backend/lib/route-manifest.js'),
      }));
    }}],
  });
  const source = Buffer.from(result.outputFiles[0].text).toString('base64');
  const { resolveEcommerceAdminPath } = await import('data:text/javascript;base64,' + source);
  for (const href of paths) {
    assert.equal(resolveEcommerceAdminPath(href), href, 'valid route changed: ' + href);
  }
  for (const href of [
    '/admin/agentsam', '/admin/scaffold?view=markets', '/admin/scaffold?view=pos',
    '/admin/login', '/admin/pos', '/admin/store?target=https://outside.test',
    '//outside.test/admin/store', '/admin/../../outside',
  ]) assert.equal(resolveEcommerceAdminPath(href), null, 'excluded route admitted: ' + href);
});
