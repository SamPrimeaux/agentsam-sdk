import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertCmsSiteIdentity, createCmsDbClient } from '../../apps/local-studio/backend/worker/cms-db.js';
import { injectSitePartials, fetchSitePartial, putSitePartial } from '../../apps/local-studio/backend/worker/site-partials.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const at = (...parts) => path.join(root, ...parts);
const read = (...parts) => fs.readFileSync(at(...parts), 'utf8');

test('CMS D1 query helper requires an authorized site identity', () => {
  assert.throws(() => assertCmsSiteIdentity(null), /site id and account_id are required/);
  assert.throws(() => assertCmsSiteIdentity({ id: 'site_only' }), /site id and account_id are required/);
  assert.throws(() => assertCmsSiteIdentity({ account_id: 'account_only' }), /site id and account_id are required/);
  assert.throws(() => createCmsDbClient({}, null), /site id and account_id are required/);
  assert.equal(assertCmsSiteIdentity({ id: ' site_sdk ', account_id: ' account_sdk ' }).id, 'site_sdk');
});

test('CMS D1 reads and writes are scoped by canonical site_id', async () => {
  const capturedQueries = [];
  const site = {
    id: 'site_agentsam_sdk', account_id: 'account_sdk', slug: 'agentsam-sdk',
    name: 'AgentSam SDK', primary_domain: 'agentsam.inneranimalmedia.com',
  };
  const page = {
    id: 'page_test', site_id: site.id, slug: 'home', route_path: '/',
    page_type: 'home', title: 'Home', status: 'draft', created_at: 1, updated_at: 1,
  };
  const mockDb = {
    prepare(query) {
      return {
        bind(...args) {
          capturedQueries.push({ query, args });
          return {
            async first() {
              if (query.includes('FROM cms_sites')) return site;
              if (query.includes('FROM cms_pages')) return page;
              if (query.includes('FROM cms_site_theme_overrides')) return null;
              return null;
            },
            async all() {
              if (query.includes('FROM cms_pages')) return { results: [page] };
              if (query.includes('cms_page_sections')) return { results: [{ id: 'sec_test', page_id: page.id }] };
              if (query.includes('cms_section_blocks')) return { results: [{ id: 'blk_test', section_id: 'sec_test' }] };
              return { results: [] };
            },
            async run() { return { meta: { changes: 1 } }; },
          };
        },
      };
    },
    async batch() { return []; },
  };

  const client = createCmsDbClient(mockDb, site);
  await client.getSite();
  await client.getPages();
  await client.getPageById('page_test');
  await client.getSectionsForPage('page_test');
  await client.getAllSectionsForSite();
  await client.getAllBlocksForSite();
  await client.getBlocksForSection('sec_test');
  await client.getThemeOverrides();
  await client.getLiquidImports();
  await client.getActivity();
  await client.getTemplates();

  assert.ok(capturedQueries.length >= 11);
  for (const { query, args } of capturedQueries) {
    if (/cms_pages|cms_page_sections|cms_section_blocks|cms_site_theme_overrides|cms_liquid_imports|cms_activity_log|cms_component_templates/.test(query)) {
      assert.ok(query.includes('site_id'), `CMS data query must be site-scoped: ${query}`);
      assert.ok(args.includes(site.id), `Query must bind site id: ${JSON.stringify(args)} for ${query}`);
    }
    if (query.includes('FROM cms_pages')) {
      assert.doesNotMatch(query, /project_id|project_slug|workspace_id|person_uuid|worker_id/);
    }
  }
});

test('Local Studio /cms delegates to the canonical Ecommerce Online Store', () => {
  const route = read('apps', 'local-studio', 'frontend', 'src', 'routes', '(apps)', 'cms.tsx');
  const ecommercePkg = JSON.parse(read('apps', 'ecommerce-cms-agentsam', 'package.json'));
  const appManifest = JSON.parse(read('apps', 'ecommerce-cms-agentsam', 'agentsam.app.json'));

  assert.equal(ecommercePkg.name, '@inneranimalmedia/ecommerce-cms-agentsam');
  assert.equal(ecommercePkg.version, appManifest.version, 'APP owns its independent package version');
  assert.equal(ecommercePkg.name, appManifest.package, 'APP package identity matches its manifest');
  assert.ok(ecommercePkg.exports?.['./cms'], 'the canonical product may expose reusable CMS capabilities');

  assert.match(route, /createFileRoute\(['"]\/\(apps\)\/cms['"]\)/);
  assert.match(route, /<Navigate/);
  assert.match(route, /to="\/apps\/ecommerce-cms-agentsam"/);
  assert.match(route, /page:\s*['"]\/admin\/store['"]/);
  assert.match(route, /replace/);
  assert.doesNotMatch(route, /client-cms-editor|CmsHomePage|CmsOnlineStoreFrame|ThemeProjectEditor|ThemeEditorFrame|ContentStudioPage|studioCmsFetch/);
});

test('Local Studio /cms is a route alias, not a second CMS editor', () => {
  const liveRoute = at('apps', 'local-studio', 'frontend', 'src', 'routes', '(apps)', 'cms.tsx');
  assert.ok(fs.existsSync(liveRoute), 'live CMS entry must remain a routable alias');
  const routeContent = read('apps', 'local-studio', 'frontend', 'src', 'routes', '(apps)', 'cms.tsx');

  // Superseded donor remains inert; do not revive the obsolete route implementation.
  const donor = read('apps', 'local-studio', 'frontend', 'src', 'routes', '_app', 'cms.tsx');
  assert.match(donor, /SUPERSEDED/);
  assert.doesNotMatch(donor, /from ["']@inneranimalmedia\/agentsam-cms-frontend["']/);
  assert.doesNotMatch(donor, /createFileRoute\(/);
  assert.match(donor, /export\s*\{\s*\}\s*;/);

  assert.match(routeContent, /to="\/apps\/ecommerce-cms-agentsam"/);
  assert.match(routeContent, /page:\s*['"]\/admin\/store['"]/);
  assert.doesNotMatch(routeContent, /useAuthorizedCmsSites|createHttpCmsAdapter|createRemoteThemeEditorAdapter|CmsOnlineStoreFrame|ThemeProjectEditor|ThemeEditorFrame|ContentStudioPage/);
  assert.doesNotMatch(routeContent, /slug:\s*["']agentsam-sdk["']/);

  const navRail = read('apps', 'local-studio', 'frontend', 'src', 'components', 'shell', 'nav-rail.tsx');
  assert.match(navRail, /to:\s*"\/cms"/);
  assert.match(navRail, /label:\s*"CMS"/);
});

test('Local Studio Worker dispatches /api/cms/* with strict tenant isolation', () => {
  const workerContent = read('apps', 'local-studio', 'backend', 'worker', 'index.js');
  assert.match(workerContent, /url\.pathname\.startsWith\("\/api\/cms\/"\)/);
  assert.match(workerContent, /handleCmsWorkerRequest/);

  const cmsService = read('apps', 'local-studio', 'backend', 'worker', 'cms-service.js');
  // Worker requests must name their tenant explicitly; the UI may choose its own default.
  assert.match(cmsService, /site_required/);
  assert.doesNotMatch(cmsService, /['"]agentsam-sdk['"]/);
  assert.match(cmsService, /createCmsDbClient\(env\.DB,\s*ownedSite\)/);
});

test('homepage.html is decomposed into reusable site partials with relative links and edge injection markers', () => {
  assert.ok(fs.existsSync(at('sites', 'agentsam-sdk', 'partials', 'header.html')));
  assert.ok(fs.existsSync(at('sites', 'agentsam-sdk', 'partials', 'footer.html')));
  assert.ok(fs.existsSync(at('apps', 'frontend', 'public', 'site', 'global', 'asbd-header.html')));
  assert.ok(fs.existsSync(at('apps', 'frontend', 'public', 'site', 'global', 'asbd-footer.html')));

  const header = read('sites', 'agentsam-sdk', 'partials', 'header.html');
  const footer = read('sites', 'agentsam-sdk', 'partials', 'footer.html');
  const homepage = read('apps', 'frontend', 'public', 'site', 'homepage.html');

  // Header and footer are non-empty
  assert.ok(header.length > 500, 'header.html must contain full header content');
  assert.ok(footer.length > 500, 'footer.html must contain full footer content');

  // AgentSam public header navigation is relative and product-specific (R2 partial SSOT).
  assert.match(header, /href="\/"/);
  assert.match(header, /href="\/learn\/"/);
  assert.match(header, /href="\/themes\/"/);
  assert.match(header, /href="\/packages\/sdk\/help\/"/);
  assert.match(header, /href="\/auth\/login\?next=\/agentsam"/);
  assert.doesNotMatch(header, /href="https:\/\/inneranimalmedia\.com\/(learn|themes|packages\/sdk|agentsam)"/);

  assert.match(footer, /href="\/work"/);
  assert.match(footer, /href="\/about"/);
  assert.match(footer, /href="\/services"/);
  assert.match(footer, /href="\/contact"/);
  assert.match(footer, /href="\/privacy"/);
  assert.match(footer, /href="\/terms"/);
  assert.match(footer, /href="\/sitemap"/);
  assert.doesNotMatch(footer, /href="https:\/\/inneranimalmedia\.com\/(work|about|services|contact|privacy|terms|sitemap)"/);

  // Public homepage shell uses ASBD mounts + client inject of global partials
  // (R2 sites/{site}/partials remain the publish/edge SSOT via publish-website-assets).
  assert.match(homepage, /id="asbd-header-mount"/);
  assert.match(homepage, /id="asbd-footer-mount"/);
  assert.match(homepage, /inject\('asbd-header-mount',\s*'\/site\/global\/asbd-header\.html'\)/);
  assert.match(homepage, /inject\('asbd-footer-mount',\s*'\/site\/global\/asbd-footer\.html'\)/);
  assert.doesNotMatch(homepage, /<nav class="iam-sidenav" id="iamSidenav"/, 'inline sidenav should be in partials');
});

test('Local Studio CMS writes target canonical site-owned tables, not retired component storage', () => {
  const cmsDb = read('apps', 'local-studio', 'backend', 'worker', 'cms-db.js');

  assert.ok(cmsDb.includes('INSERT INTO cms_pages ('));
  assert.ok(cmsDb.includes('id, site_id, slug, route_path, page_type, title, status'));
  assert.ok(cmsDb.includes('WHERE id = ? AND site_id = ?'));
  assert.ok(cmsDb.includes('INSERT INTO cms_section_blocks'));
  assert.ok(cmsDb.includes('UPDATE cms_section_blocks'));
  assert.ok(cmsDb.includes('DELETE FROM cms_section_blocks'));
  assert.ok(cmsDb.includes('INSERT INTO cms_site_theme_overrides'));
  assert.ok(cmsDb.includes('ON CONFLICT(site_id, workspace_id, project_slug)'));
  assert.doesNotMatch(cmsDb, /cms_section_components/);
  assert.doesNotMatch(cmsDb, /FROM cms_pages[^;]*(project_id|project_slug|workspace_id|person_uuid|worker_id)/);
  assert.doesNotMatch(cmsDb, /tenant_sam_primeaux|usr_sam_primeaux/);
  assert.doesNotMatch(cmsDb, /ensureSeeded/);
});

function r2Stub(store = new Map()) {
  return {
    async get(key) {
      if (!store.has(key)) return null;
      return { text: async () => store.get(key) };
    },
    async put(key, content) {
      store.set(key, typeof content === 'string' ? content : String(content));
      return { key };
    },
    async head() {
      return null;
    },
    async list() {
      return { objects: [] };
    },
  };
}

test('site-partials service injects header and footer from R2 into HTML response', async () => {
  const store = new Map();
  store.set('sites/agentsam-sdk/partials/header.html', '<header id="injected-header">Header Content</header>');
  store.set('sites/agentsam-sdk/partials/footer.html', '<footer id="injected-footer">Footer Content</footer>');

  const env = { WEBSITE_ASSETS: r2Stub(store) };

  // Fetch and put partials
  const fetchedHeader = await fetchSitePartial(env, 'agentsam-sdk', 'header');
  assert.equal(fetchedHeader, '<header id="injected-header">Header Content</header>');

  await putSitePartial(env, 'agentsam-sdk', 'header', '<header id="updated">Updated</header>');
  const updatedHeader = await fetchSitePartial(env, 'agentsam-sdk', 'header');
  assert.equal(updatedHeader, '<header id="updated">Updated</header>');

  // Test HTML injection
  const baseHtml = '<!DOCTYPE html><html><head><title>Test</title></head><body><main>Main Content</main></body></html>';
  const initialResponse = new Response(baseHtml, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });

  const injectedResponse = await injectSitePartials(initialResponse, env, 'agentsam-sdk');
  const transformedText = await injectedResponse.text();

  assert.ok(transformedText.includes('<header id="updated">Updated</header>'), 'Response must contain injected header');
  assert.ok(transformedText.includes('<footer id="injected-footer">Footer Content</footer>'), 'Response must contain injected footer');
  assert.ok(transformedText.includes('<main>Main Content</main>'), 'Response must preserve main content');

  // Verify non-text/html responses are guarded and untouched
  const jsonResponse = new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json' },
  });
  const unedited = await injectSitePartials(jsonResponse, env, 'agentsam-sdk');
  assert.equal(await unedited.text(), JSON.stringify({ ok: true }));
});

test('Local Studio canonical homepage serves with edge HTMLRewriter partial injection and text/html', async () => {
  const { serveCanonicalHomepage } = await import('../../apps/local-studio/backend/worker/canonical-homepage.js');

  const store = new Map([
    ['sites/agentsam-sdk/partials/header.html', '<header id="live-header">SDK Header</header>'],
    ['sites/agentsam-sdk/partials/footer.html', '<footer id="live-footer">SDK Footer</footer>'],
  ]);
  const env = { WEBSITE_ASSETS: r2Stub(store) };

  const rootReq = new Request('https://agentsam.inneranimalmedia.com/', { method: 'GET' });
  const rootRes = await serveCanonicalHomepage(rootReq, env, 'agentsam-sdk');
  assert.equal(rootRes.status, 200);
  assert.ok(rootRes.headers.get('content-type')?.includes('text/html'), 'Content type must be text/html');
  const rootText = await rootRes.text();
  assert.ok(rootText.includes('<header id="live-header">SDK Header</header>'), 'Edge injection must inject header at /');
  assert.ok(rootText.includes('<footer id="live-footer">SDK Footer</footer>'), 'Edge injection must inject footer at /');
  assert.ok(rootText.includes('@inneranimalmedia/agentsam-sdk'), 'Canonical homepage content must be present');

  // Verify index.js routes / and /index.html to serveCanonicalHomepage
  const indexJsContent = fs.readFileSync(at('apps/local-studio/backend/worker/index.js'), 'utf8');
  assert.ok(
    indexJsContent.includes('serveCanonicalHomepage(request, env)'),
    'index.js must call serveCanonicalHomepage for root route'
  );
  assert.ok(
    indexJsContent.includes('url.pathname === "/" || url.pathname === "/index.html"'),
    'index.js must match both / and /index.html'
  );
});

