import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_ROUTE_MANIFEST, adminRouteForPath } from '../../ecommerce-cms-agentsam/backend/lib/route-manifest.js';
import { LOCAL_STUDIO_ECOMMERCE_ADMIN_ROUTES, resolveLocalStudioEcommerceAdminRoute } from '../shared/ecommerce-admin-routes.mjs';

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
  '/admin/analytics/security',
  '/admin/theme-editor?slug=home',
  '/admin/theme-editor?showcase=plain-jane&slug=journal-home',
  '/admin/theme-editor?new=1&site_id=site_a',
  '/admin/sites/site_a/pages/cmsp_home_a/editor',
  '/admin/sites/site_a/themes/theme_plain-jane/editor/home?previewMode=tablet',
  '/admin/sites/site_a/settings/editor',
  '/admin/pages',
  '/admin/page-edit?slug=about',
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

test('standalone and hosted route authorities both recognize supported Ecommerce admin paths', () => {
  const standalone = ADMIN_ROUTE_MANIFEST.map(x => x.path);
  const hosted = LOCAL_STUDIO_ECOMMERCE_ADMIN_ROUTES.map(x => x.path);
  for (const href of paths) {
    const pathname = href.split('?')[0];
    assert.ok(standalone.includes(pathname) || adminRouteForPath(pathname),
      'missing standalone admin route: ' + href);
    assert.ok(hosted.includes(pathname) || resolveLocalStudioEcommerceAdminRoute(pathname),
      'missing Local Studio hosted admin route: ' + href);
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
  const { resolveEcommerceAdminPath, resolveEcommerceAssetPath, resolveEcommerceAdminDestination } = await import('data:text/javascript;base64,' + source);
  assert.equal(resolveEcommerceAssetPath('/admin/products'), '/ecommerce-cms-agentsam/admin/products.html');
  assert.equal(resolveEcommerceAssetPath('/admin/product-edit?id=12'), '/ecommerce-cms-agentsam/admin/product-edit.html?id=12');
  assert.equal(resolveEcommerceAssetPath('/admin/page-edit?slug=about'), '/ecommerce-cms-agentsam/admin/page-edit.html?slug=about');
  assert.equal(resolveEcommerceAssetPath('/admin/theme-editor?showcase=plain-jane&slug=journal-home'),
    '/ecommerce-cms-agentsam/admin/theme-editor.html?showcase=plain-jane&slug=journal-home');
  assert.equal(resolveEcommerceAssetPath('/admin/sites/site_a/themes/theme_plain-jane/editor/home?previewMode=tablet'),
    '/ecommerce-cms-agentsam/admin/theme-editor.html?previewMode=tablet');
  assert.equal(resolveEcommerceAssetPath('/admin/sites/site_a/pages/cmsp_home_a/editor'),
    '/ecommerce-cms-agentsam/admin/theme-editor.html');
  assert.equal(resolveEcommerceAssetPath('/admin/theme-editor?new=1&site_id=site_a'),
    '/ecommerce-cms-agentsam/admin/theme-editor.html?new=1&site_id=site_a');
  assert.equal(resolveEcommerceAdminPath('/admin/theme-editor?new=0&site_id=site_a'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/theme-editor?new=1&site_id=site_a&project=other'), null);
  assert.equal(resolveEcommerceAssetPath('/admin/products/create'), '/ecommerce-cms-agentsam/admin/_spa/index.html?__route=%2Fproducts%2Fcreate');
  assert.equal(resolveEcommerceAssetPath('/admin/products/create?site_id=site-a'), '/ecommerce-cms-agentsam/admin/_spa/index.html?__route=%2Fproducts%2Fcreate%3Fsite_id%3Dsite-a');
  assert.equal(resolveEcommerceAssetPath('/admin/products/create/blueprint_12'), '/ecommerce-cms-agentsam/admin/_spa/index.html?__route=%2Fproducts%2Fcreate%2Fblueprint_12');
  assert.equal(resolveEcommerceAssetPath('//outside.test/admin/products'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/products?view=collections'), '/admin/products?view=collections');
  for(const href of [
    '/admin/products?view=collections&site_id=site-a&collection_id=cmscol_a',
    '/admin/product-edit?id=12&site_id=site-a',
    '/admin/theme-project-editor?project=theme_heuristic&site_id=site-a&page=shop',
    '/admin/theme-workspace',
    '/admin/theme-project-editor?new=1&site_id=site-a',
    '/admin/theme-project-editor?project=theme_heuristic&site_id=site-a&page=home&section=hero&block=heading&previewMode=tablet',
    '/admin/inventory?site_id=site-a',
    '/admin/store?site_id=site-a',
    '/admin/products/create?site_id=site-a',
    '/admin/products/create/12?site_id=site-a',
    '/admin/products/create/12?resume=psd_saved_42',
    '/admin/products/create/12?site_id=site-a&resume=psd_saved_42',
    '/admin/products/create?collection_id=cmscol_existing',
    '/admin/products/create/prod_test_application?collection_id=cmscol_existing',
    '/admin/products/create/12?site_id=site-a&collection_id=cmscol_existing',
  ])assert.equal(resolveEcommerceAdminPath(href),href,'site context and saved design must survive the installed host');
  assert.equal(resolveEcommerceAdminPath('/admin/products/create?resume=psd_unscoped'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/products/create?collection_id=../bad'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/products/create/prod_test_application?collection_id=cmscol_ok&unknown=x'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/products/create/12?resume=psd_first&resume=psd_second'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/products/create/12?resume=https://another-site.example'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/products?site_id=site-a&site_id=site-b'),null);
  assert.equal(resolveEcommerceAdminPath('/admin/products?site_id=site-a&unexpected=1'),null);
  assert.equal(resolveEcommerceAdminPath('/admin/theme-project-editor?new=0&site_id=site-a'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/theme-project-editor?new=1'), '/admin/theme-project-editor?new=1', 'Account-owned theme authoring is supported without a site');
  assert.equal(resolveEcommerceAdminPath('/admin/theme-project-editor?new=1&project=other&site_id=site-a'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/theme-project-editor?new=1&new=1&site_id=site-a'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/theme-project-editor?project=theme_heuristic&site_id=site-a&previewMode=unknown'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/theme-project-editor?project=theme_plain-jane&scope=studio'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/theme-project-editor?project=theme_plain-jane&site_id=site-a'), '/admin/theme-project-editor?project=theme_plain-jane&site_id=site-a');
  assert.equal(resolveEcommerceAdminPath('/admin/theme-project-editor?project=theme_plain-jane&scope=studio&site_id=site-a'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/theme-project-editor?scope=site&project=theme_plain-jane'), null);

  assert.equal(resolveEcommerceAdminPath('/admin/products?view=platform'), '/admin/products?view=platform');
  assert.equal(resolveEcommerceAdminPath('/admin/products?view=store'), '/admin/products?view=store');
  assert.equal(resolveEcommerceAdminPath('/admin/content?kind=image'), '/admin/content?kind=image');
  assert.equal(resolveEcommerceAdminPath('/admin/content?kind=video'), '/admin/content?kind=video');
  assert.equal(resolveEcommerceAdminPath('/admin/products?view=made-up'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/page-edit?slug=about&site=other-merchant'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/pages?site_id=site-a'), '/admin/pages?site_id=site-a');
  assert.equal(resolveEcommerceAdminPath('/admin/page-edit?slug=about&site_id=site-a&page_id=cmsp_123'), '/admin/page-edit?slug=about&site_id=site-a&page_id=cmsp_123');
  assert.equal(resolveEcommerceAdminPath('/admin/theme-editor?slug=about&site_id=site-a&page_id=cmsp_123'), '/admin/theme-editor?slug=about&site_id=site-a&page_id=cmsp_123');
  assert.equal(resolveEcommerceAdminPath('/admin/sites/site_a/pages/cmsp_home_a/editor?marketplace_kind=cms_embed&marketplace_key=announcement_bar'),
    '/admin/sites/site_a/pages/cmsp_home_a/editor?marketplace_kind=cms_embed&marketplace_key=announcement_bar');
  assert.equal(resolveEcommerceAdminPath('/admin/sites/site_a/themes/theme_plain-jane/editor/home?previewMode=tablet'),
    '/admin/sites/site_a/themes/theme_plain-jane/editor/home?previewMode=tablet');
  assert.equal(resolveEcommerceAdminPath('/admin/sites/site_a/themes/theme_plain-jane/editor/home?site_id=site_a'), null,
    'the strict clean-route contract rejects duplicate site identity in the query');
  const cleanThemeEditor = '/admin/sites/site_a/themes/theme_plain-jane/editor/home';
  const cleanThemeHost = cleanThemeEditor;
  assert.equal(resolveEcommerceAdminDestination(cleanThemeEditor, 'site_a', 'https://agentsam.example'), cleanThemeHost,
    'site identity already in the clean path must not be duplicated as a rejected site_id query');
  assert.equal(resolveEcommerceAdminDestination(cleanThemeEditor + '?site_id=site_a', 'site_a', 'https://agentsam.example'), cleanThemeHost,
    'normalize legacy redundant site_id without changing the selected site');
  assert.equal(resolveEcommerceAdminDestination(cleanThemeEditor + '?site_id=site_a&site_id=site_a', 'site_a', 'https://agentsam.example'), null,
    'reject duplicate site identity instead of silently normalizing ambiguous input');
  assert.equal(resolveEcommerceAdminDestination(cleanThemeEditor, 'site_b', 'https://agentsam.example'), null,
    'never route a theme into a different selected site');
  assert.equal(resolveEcommerceAdminDestination('/admin/theme-project-editor?project=theme_plain-jane&page=home', 'site_a', 'https://agentsam.example'),
    '/admin/theme-project-editor?project=theme_plain-jane&page=home&site_id=site_a',
    'legacy editor routes receive the site identity in the query');
  assert.equal(resolveEcommerceAdminDestination('/admin/theme-workspace', 'site_a', 'https://agentsam.example'),
    '/admin/theme-workspace?site_id=site_a',
    'the registered Theme Workspace route remains available through the same host');
  assert.equal(resolveEcommerceAdminPath('/admin/sites/site_a/themes/theme_plain-jane/editor/home?marketplace_kind=bad'),
    null);
  assert.equal(resolveEcommerceAdminPath('/admin/theme-editor?slug=sam-docs&site=agentsam-sdk&source=html'), null, 'Retired legacy HTML source query is not an authorized editor destination');
  assert.equal(resolveEcommerceAdminPath('/admin/store?site_id=site_a&view=themes'), '/admin/store?site_id=site_a&view=themes');
  assert.equal(resolveEcommerceAdminPath('/admin/store?view=platform'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/page-edit?slug=about&slug=shop'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/theme-editor?catalog=unknown&slug=home'), null);
  assert.equal(resolveEcommerceAdminPath('/admin/theme-editor?slug=home&catalog=revise'), null, 'Retired catalog shortcut no longer resolves');
  for (const href of paths) {
    assert.equal(resolveEcommerceAdminPath(href), href, 'valid route changed: ' + href);
  }
  for (const href of [
    '/admin/agentsam', '/admin/scaffold?view=markets', '/admin/scaffold?view=pos',
    '/admin/login', '/admin/pos', '/admin/store?target=https://outside.test',
    '//outside.test/admin/store', '/admin/../../outside',
  ]) assert.equal(resolveEcommerceAdminPath(href), null, 'excluded route admitted: ' + href);
});


test('desktop host validates product destinations before navigation and leaves the current screen intact on rejection', async () => {
  const result = await build({
    entryPoints: [path.join(studio, 'frontend/src/lib/apps/desktop-console-host.ts')],
    bundle: true, platform: 'node', format: 'esm', target: 'node22', write: false,
    plugins: [{
      name: 'isolated-native-host-contract',
      setup(ctx) {
        ctx.onResolve({ filter: /^@inneranimalmedia\/ecommerce-cms-agentsam\/backend\/routes$/ }, () => ({
          path: path.join(repo, 'apps/ecommerce-cms-agentsam/backend/lib/route-manifest.js'),
        }));
        ctx.onResolve({ filter: /^@\/lib\/desktop\/tauri$/ }, () => ({ path: 'tauri', namespace: 'host-mock' }));
        ctx.onResolve({ filter: /^sonner$/ }, () => ({ path: 'toast', namespace: 'host-mock' }));
        ctx.onLoad({ filter: /.*/, namespace: 'host-mock' }, args => ({
          contents: args.path === 'tauri'
            ? 'export const isPackagedDesktop = () => true; export const invokeStudioService = async () => { throw Error("not used"); };'
            : 'export const toast = { error(message) { globalThis.__agentsamTestRouteErrors.push(message); } };',
          loader: 'js',
        }));
      },
    }],
  });
  globalThis.__agentsamTestRouteErrors = [];
  try {
    const source = Buffer.from(result.outputFiles[0].text).toString('base64');
    const { createDesktopConsoleHost, consoleDestination } = await import('data:text/javascript;base64,' + source);
    const destinations = [];
    const host = createDesktopConsoleHost(destination => destinations.push(destination));
    const valid = '/apps/ecommerce-cms-agentsam?page=' + encodeURIComponent('/admin/products/create');

    assert.equal(consoleDestination('/admin/products/create'), valid);
    const themeEditor = '/admin/sites/site_a/themes/theme_plain-jane/editor/home';
    assert.equal(consoleDestination(themeEditor),
      '/apps/ecommerce-cms-agentsam?page=' + encodeURIComponent(themeEditor));
    assert.equal(consoleDestination('/admin/products/create?resume=unknown_draft'), null);
    host.navigate('/admin/products/create');
    host.navigate(valid);
    assert.deepEqual(destinations, [valid, valid]);

    host.navigate('/admin/products/create?resume=unknown_draft');
    host.navigate('/apps/ecommerce-cms-agentsam?page=' + encodeURIComponent('/admin/products/create?resume=unknown_draft'));
    assert.deepEqual(destinations, [valid, valid], 'invalid routes must never displace the current workspace');
    assert.equal(globalThis.__agentsamTestRouteErrors.length, 2);
  } finally {
    delete globalThis.__agentsamTestRouteErrors;
  }
});


test('Ecommerce iframe always uses packaged product assets and one host-owned navigation shell', () => {
  const host = fs.readFileSync(path.join(studio, 'frontend/src/routes/(apps)/admin/apps/ecommerce-cms-agentsam.tsx'), 'utf8');
  const store = fs.readFileSync(path.join(studio, 'frontend/src/routes/(apps)/admin/store.tsx'), 'utf8');
  assert.match(host, /const assetPath = page && !isCodeEditor \? resolveEcommerceAssetPath\(page\) : null/);
  assert.match(host, /resolved\.searchParams\.set\('__agentsamEmbedded', '1'\)/);
  assert.doesNotMatch(host, /forcePackagedAsset/, 'there must not be separate iframe ownership paths');
  assert.doesNotMatch(store, /forcePackagedAsset/);
  const onlineStore = fs.readFileSync(path.join(studio, 'frontend/src/components/store/OnlineStorePage.tsx'), 'utf8');
  assert.match(onlineStore, /resolveEcommerceAdminDestination\(href, siteId, window\.location\.origin\)/,
    'Online Store must use the canonical Local Studio route resolver for theme editor handoff');
});

test('native mobile Online Store separates overview and theme management while preserving site scope',()=>{
 const page=fs.readFileSync(path.join(studio,'frontend/src/components/store/OnlineStorePage.tsx'),'utf8');
 const route=fs.readFileSync(path.join(studio,'frontend/src/routes/(apps)/admin/store.tsx'),'utf8');
 assert.match(route,/view: params\.view === 'themes'/);
 assert.match(route,/<OnlineStorePage siteId=\{search.site_id\} view=\{search.view\}/);
 assert.match(page,/width=\{1440\} height=\{1050\}/);
 assert.match(page,/width=\{390\} height=\{620\}/);
 assert.match(page,/role="switch" aria-label="Password protection"/);
 assert.match(page,/expected_version:result.project.revision/);
 assert.match(page,/const activeTheme = data.active_theme \|\| null/);
});
