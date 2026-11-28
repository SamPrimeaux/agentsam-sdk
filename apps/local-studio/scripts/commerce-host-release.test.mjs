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
  const bootstrap = read('../../ecommerce-cms-agentsam/frontend/static/js/theme-studio-bootstrap.mjs');
  assert.doesNotMatch(page, /theme-preview-runtime\.js/);
  assert.match(page, /theme-studio-bootstrap\.mjs/);
  assert.match(bootstrap, /mountThemeEditor/);
  assert.match(bootstrap, /createThemeEditorBridge/);
  const stage = read('../scripts/stage-shell-assets.mjs');
  for (const path of ['studio-cms-source-host.js', 'studio-cms-source-host.css']) assert.match(stage, new RegExp(path.replaceAll('.', '\\.')));
});
test('host routes authenticated Ecommerce CMS and AgentSam APIs rather than returning generic Nitro 404', () => {
  const worker = read('../backend/worker/index.js');
  for (const prefix of ['/api/admin/cms/','/api/admin/agentsam/','/api/admin/theme-editor/','/api/admin/store/','/api/admin/growth/']) {
    assert.ok(worker.includes('pathname.startsWith("' + prefix + '")'), 'missing hosted route: ' + prefix);
  }
  assert.match(worker, /resolveSessionUserId\(request, env\)/);
  assert.match(worker, /handleEcommerceAdminApi\(request, scopedCommerceEnv, url, context, studioUser\)/);
  const ecommerceApi = read('../../ecommerce-cms-agentsam/backend/admin/api.js');
  assert.match(ecommerceApi, /path.startsWith\(\"\/api\/admin\/growth\/\"\)/);
});
test('installed site and theme-editor entrypoints stay inside the Local Studio app host', () => {
  const sites = read('../frontend/src/routes/(apps)/sites.tsx');
  assert.match(sites, /<Navigate to="\/admin\/sites"/);
  const adminSites = read('../frontend/src/routes/(apps)/admin/sites.tsx');
  assert.match(adminSites, /themeStoreTrySelection/);
  assert.match(adminSites, /navigateApp\(destination\.pathname \+ destination\.search\)/);
  assert.match(adminSites, /<Navigate to="\/admin\/store"/);
  assert.doesNotMatch(sites, /window\.location\.replace/);
  assert.doesNotMatch(adminSites, /window\.location\.(assign|replace)/);
  const shell = read('../frontend/agentsam/AgentSamShell.tsx');
  assert.match(shell, /desktopEcommerceHostDestination/);
  const routing = read('../frontend/src/lib/apps/ecommerce-routing.ts');
  assert.match(routing, /shouldRedirectEcommerceAppHost/);
  const adapter = read('../frontend/public/admin/host-config.js');
  assert.match(adapter, /window\.__agentsamAdminNavigate/);
  assert.doesNotMatch(adapter, /url\.pathname\.startsWith\('\/api\/work\/'\)/);
  assert.doesNotMatch(adapter, /url\.pathname === '\/api\/projects'/);
  const pages = read('../../ecommerce-cms-agentsam/frontend/static/pages.html');
  const editor = read('../../ecommerce-cms-agentsam/frontend/static/page-edit.html');
  const pageEditorJs = read('../../ecommerce-cms-agentsam/frontend/static/js/page-editor-review.js');
  const themeBootstrap = read('../../ecommerce-cms-agentsam/frontend/static/js/theme-studio-bootstrap.mjs');
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
  assert.match(editor, /page-editor-review\.js/);
  assert.match(pageEditorJs, /window\.cmsAdminNavigate\("\/admin\/page-edit/);
  assert.match(pageEditorJs, /cmsAdminFetch\(/);
  assert.match(themeBootstrap, /themeProjectEditorPath/);
  assert.match(themeBootstrap, /cmsPageEditorPath/);
  assert.match(themeBootstrap, /replaceEditorUrl/);
});

test('dock derives its actual tabs from ecommerce app manifest and avoids a competing shell', () => {
  const product=JSON.parse(read('../../ecommerce-cms-agentsam/agentsam.app.json'));
  assert.ok(product.dock.tabs.length >= 5);
  const source=read('../../ecommerce-cms-agentsam/frontend/dock/index.js');
  assert.match(source, /mountAdminDock/);
  assert.match(source, /host\.openNav/);
  assert.match(source, /host\.open/);
});
