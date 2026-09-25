import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertProjectSlug, createCmsDbClient } from '../../apps/local-studio/backend/worker/cms-db.js';
import { injectSitePartials, fetchSitePartial, putSitePartial } from '../../apps/local-studio/backend/worker/site-partials.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const at = (...parts) => path.join(root, ...parts);
const read = (...parts) => fs.readFileSync(at(...parts), 'utf8');

test('CMS D1 query helper strictly enforces projectSlug tenancy invariant', () => {
  // Empty or invalid projectSlug must throw immediately
  assert.throws(() => assertProjectSlug(''), /CMS Tenancy Invariant Violation/);
  assert.throws(() => assertProjectSlug('   '), /CMS Tenancy Invariant Violation/);
  assert.throws(() => assertProjectSlug(null), /CMS Tenancy Invariant Violation/);
  assert.throws(() => assertProjectSlug(undefined), /CMS Tenancy Invariant Violation/);
  assert.throws(() => createCmsDbClient({}, ''), /CMS Tenancy Invariant Violation/);

  assert.equal(assertProjectSlug('agentsam-sdk'), 'agentsam-sdk');
});

test('CMS D1 queries all enforce project-scoped tenancy without cross-tenant leaks', async () => {
  const capturedQueries = [];
  const mockDb = {
    prepare(query) {
      return {
        bind(...args) {
          capturedQueries.push({ query, args });
          return {
            async all() {
              if (query.includes('FROM cms_pages WHERE project_slug = ?')) {
                return { results: [{ id: 'page_test', project_slug: 'agentsam-sdk', title: 'Test' }] };
              }
              if (query.includes('FROM cms_pages WHERE id = ? AND project_slug = ?')) {
                return { results: [{ id: args[0], project_slug: 'agentsam-sdk', title: 'Test' }] };
              }
              if (query.includes('SELECT s.id FROM cms_page_sections s')) {
                return { results: [{ id: 'sec_test' }] };
              }
              if (query.includes('SELECT b.* FROM cms_section_components b')) {
                return { results: [{ id: 'blk_test', component_type: 'card', component_data: '{}' }] };
              }
              if (query.includes('SELECT s.* FROM cms_page_sections s')) {
                return { results: [{ id: 'sec_test', section_name: 'Test', section_data: '{}' }] };
              }
              return { results: [] };
            },
            async run() {
              return { success: true };
            },
          };
        },
      };
    },
  };

  const client = createCmsDbClient(mockDb, 'agentsam-sdk');

  await client.getProject();
  await client.getPages();
  await client.getPageById('page_123');
  await client.getSectionsForPage('page_123');
  await client.getAllSectionsForSite();
  await client.getAllBlocksForSite();
  await client.getBlocksForSection('sec_123');
  await client.getThemeOverrides();
  await client.getLiquidImports();
  await client.getActivity();
  await client.getTemplates();

  // Audit every captured query
  for (const { query, args } of capturedQueries) {
    const hasProjectSlugConstraint =
      query.includes('project_slug') ||
      query.includes('iam_project_slug') ||
      query.includes('project_id') ||
      query.includes('projects WHERE id = ?');
    assert.ok(
      hasProjectSlugConstraint,
      `Query must enforce project scoping: ${query}`,
    );
    assert.ok(
      args.some((arg) => typeof arg === 'string' && (arg.includes('agentsam-sdk') || arg.includes('agentsam_sdk'))),
      `Args must bind project slug: ${JSON.stringify(args)} for ${query}`,
    );
  }
});

test('Local Studio package.json explicitly declares client-cms-editor dependencies', () => {
  const pkgPath = at('apps', 'local-studio', 'frontend', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  assert.ok(pkg.dependencies['@inneranimalmedia/agentsam-cms-frontend'], 'missing @inneranimalmedia/agentsam-cms-frontend');
  assert.ok(pkg.dependencies['@inneranimalmedia/agentsam-cms-backend'], 'missing @inneranimalmedia/agentsam-cms-backend');
  assert.ok(pkg.dependencies['@inneranimalmedia/agentsam-cms-shared'], 'missing @inneranimalmedia/agentsam-cms-shared');

  assert.equal(pkg.dependencies['@inneranimalmedia/agentsam-cms-frontend'], 'file:../../client-cms-editor/frontend');
  assert.equal(pkg.dependencies['@inneranimalmedia/agentsam-cms-backend'], 'file:../../client-cms-editor/backend');
  assert.equal(pkg.dependencies['@inneranimalmedia/agentsam-cms-shared'], 'file:../../client-cms-editor/shared/cms');
});

test('Local Studio mounts CMS route with default site agentsam-sdk', () => {
  assert.ok(fs.existsSync(at('apps', 'local-studio', 'frontend', 'src', 'routes', '_app', 'cms.tsx')));
  const routeContent = read('apps', 'local-studio', 'frontend', 'src', 'routes', '_app', 'cms.tsx');

  // Must default to agentsam-sdk
  assert.match(routeContent, /"agentsam-sdk"/);
  assert.doesNotMatch(routeContent, /default\s*:\s*["']inneranimalmedia["']/);

  // Must use same-origin relative basePath
  assert.match(routeContent, /basePath="\/cms"/);

  // NavRail must include CMS entry
  const navRail = read('apps', 'local-studio', 'frontend', 'src', 'components', 'shell', 'nav-rail.tsx');
  assert.match(navRail, /to:\s*"\/cms"/);
  assert.match(navRail, /label:\s*"CMS"/);
});

test('Local Studio Worker dispatches /api/cms/* with strict tenant isolation', () => {
  const workerContent = read('apps', 'local-studio', 'backend', 'worker', 'index.js');
  assert.match(workerContent, /url\.pathname\.startsWith\("\/api\/cms\/"\)/);
  assert.match(workerContent, /handleCmsWorkerRequest/);

  const cmsService = read('apps', 'local-studio', 'backend', 'worker', 'cms-service.js');
  // Default fallback must be agentsam-sdk, never inneranimalmedia
  assert.match(cmsService, /'agentsam-sdk'/);
  assert.match(cmsService, /createCmsDbClient\(env\.DB,\s*siteSlug\)/);
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

  // Relative navigation links (R2 partial SSOT)
  assert.match(header, /href="\/work"/);
  assert.match(header, /href="\/about"/);
  assert.match(header, /href="\/services"/);
  assert.match(header, /href="\/contact"/);
  assert.match(header, /href="\/auth\/login\?next=\/agentsam"/);
  assert.doesNotMatch(header, /href="https:\/\/inneranimalmedia\.com\/(work|about|services|contact)"/);

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

