import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
test('original Ecommerce Theme Studio ships authoring and mobile dock without missing script tags', () => {
  const builder = read('../../ecommerce-cms-agentsam/bin/build-assets.mjs');
  for (const token of ['frontend/dock','frontend/profile-popup','cms/authoring/engine.ts',
    'theme-preview-registry.js','admin/js/cms-authoring-engine.js','dock.config.json']) {
    assert.ok(builder.includes(token), 'missing product asset contract: ' + token);
  }
  const page = read('../../ecommerce-cms-agentsam/frontend/static/theme-editor.html');
  assert.doesNotMatch(page, /theme-preview-runtime\.js/);
  assert.match(page, /cms-authoring-engine\.js/);
  const stage = read('../scripts/stage-shell-assets.mjs');
  for (const path of ['studio-cms-source-host.js', 'studio-cms-source-host.css']) assert.match(stage, new RegExp(path.replaceAll('.', '\\.')));
});
test('host routes authenticated Ecommerce CMS and AgentSam APIs rather than returning generic Nitro 404', () => {
  const worker = read('../backend/worker/index.js');
  for (const prefix of ['/api/admin/cms/','/api/admin/agentsam/','/api/admin/theme-editor/','/api/admin/store/','/api/admin/growth/']) {
    assert.ok(worker.includes('pathname.startsWith("' + prefix + '")'), 'missing hosted route: ' + prefix);
  }
  assert.match(worker, /resolveSessionUserId\(request, env\)/);
  assert.match(worker, /handleEcommerceAdminApi\(request, commerceEnv, url, context, studioUser\)/);
  const ecommerceApi = read('../../ecommerce-cms-agentsam/backend/admin/api.js');
  assert.match(ecommerceApi, /path.startsWith\(\"\/api\/admin\/growth\/\"\)/);
});
test('installed site/editor entrypoints and programmatic page changes stay in Local Studio', () => {
  const sites = read('../frontend/src/routes/(apps)/sites.tsx');
  assert.match(sites, /<Navigate to="\/admin\/store"/);
  assert.doesNotMatch(sites, /window\.location\.replace/);
  const adapter = read('../frontend/public/admin/host-config.js');
  assert.match(adapter, /window\.__agentsamAdminNavigate/);
  assert.match(adapter, /url\.pathname\.startsWith\('\/api\/work\/'\)/);
  assert.match(adapter, /url\.pathname === '\/api\/projects'/);
  const pages = read('../../ecommerce-cms-agentsam/frontend/static/pages.html');
  const editor = read('../../ecommerce-cms-agentsam/frontend/static/page-edit.html');
  const visual = read('../../ecommerce-cms-agentsam/frontend/static/js/theme-editor.js');
  const shared = read('../../ecommerce-cms-agentsam/frontend/static/js/pages-shared.js');
  assert.match(shared, /window\.cmsAdminNavigate/);
  assert.match(pages, /cmsAdminNavigate\(row\.dataset\.href\)/);
  assert.match(pages, /id="add-page-btn"/);
  assert.match(pages, /id="add-page-dialog"/);
  assert.match(pages, /method: "POST"/);
  assert.match(pages, /cmsAdminFetch\("\/api\/admin\/cms\/pages"/);
  assert.match(pages, /site_id/);
  assert.match(shared, /window\.cmsAdminFetch/);
  assert.match(shared, /page_id/);
  assert.match(editor, /cmsAdminNavigate\(`\/admin\/page-edit/);
  assert.match(editor, /cmsAdminFetch\(/);
  assert.match(visual, /cmsAdminNavigate\('\/admin\/theme-editor\?'/);
  assert.match(visual, /cmsAdminNavigate\(dest\)/);
  assert.match(visual, /cmsActivePageId/);
});

test('dock derives its actual tabs from ecommerce app manifest and avoids a competing shell', () => {
  const product=JSON.parse(read('../../ecommerce-cms-agentsam/agentsam.app.json'));
  assert.ok(product.dock.tabs.length >= 5);
  const source=read('../../ecommerce-cms-agentsam/frontend/dock/index.js');
  assert.match(source, /mountAdminDock/);
  assert.match(source, /host\.openNav/);
  assert.match(source, /host\.open/);
});
