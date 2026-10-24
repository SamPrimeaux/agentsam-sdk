import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { resolveConsoleFile, servePackagedConsole } from '../backend/worker/packaged-console.js';

test('platform routes resolve to the real Ecommerce application bundle', () => {
  for (const [path, file] of [
    ['/admin/home', 'home.html'],
    ['/sites', 'store.html'],
    ['/admin/store', 'store.html'],
    ['/admin/pages', 'pages.html'],
    ['/admin/theme-editor', 'theme-editor.html'],
    ['/admin/css/console.css', 'css/console.css'],
    ['/admin/js/shell.js', 'js/shell.js'],
    ['/admin/partials/growth-app.html', 'partials/growth-app.html'],
    ['/admin/analytics/overview', '_spa/index.html'],
  ]) assert.equal(resolveConsoleFile(path), file, path);
  for (const path of ['/api/admin/me', '/admin/../../secret', '/admin/unknown']) {
    assert.equal(resolveConsoleFile(path), null, path);
  }
});
test('Worker serves packaged assets, not a customer Worker or a reconstructed shell', async () => {
  const seen = [];
  const env = { fetch(req) {
    seen.push(new URL(req.url).pathname);
    return Promise.resolve(new Response('<html><head></head><body><script src="/admin/js/shell.js"></script>product</body></html>', { headers: { 'content-type':'text/html' } }));
  } };
  const res = await servePackagedConsole(new Request('https://agentsam.inneranimalmedia.com/admin/home'), env);
  assert.equal(res.status, 200);
  assert.equal(seen[0], '/ecommerce-cms-agentsam/admin/home');
  assert.match(await res.text(), /host-config\.js/);
});
test('Growth partial serves from installed Ecommerce assets, not customer storage', async () => {
  const seen = [];
  const assets = { fetch(request) {
    seen.push(new URL(request.url).pathname);
    return Promise.resolve(new Response('<section id="fnfGrowthApp">Live Growth workspace</section>', {
      headers: { 'content-type': 'text/html' },
    }));
  } };
  const response = await servePackagedConsole(new Request(
    'https://agentsam.inneranimalmedia.com/admin/partials/growth-app.html'), assets);
  assert.equal(response.status, 200);
  assert.deepEqual(seen, ['/ecommerce-cms-agentsam/admin/partials/growth-app']);
  assert.match(await response.text(), /id="fnfGrowthApp"/);
});

test('immutable product sources and packaged shell are the authority', () => {
  const worker = readFileSync(new URL('../backend/worker/index.js', import.meta.url), 'utf8');
  assert.match(worker, /servePackagedConsole/);
  const cloudflare = readFileSync(new URL('../backend/wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(cloudflare, /"run_worker_first": \["\/admin\/\*", "\/sites", "\/samsketch"\]/);

  const app = readFileSync(new URL('../frontend/src/routes/__root.tsx', import.meta.url), 'utf8');
  assert.match(app, /return isApp \? <AgentSamShell \/> : <Outlet \/>/);
  assert.doesNotMatch(app, /<PackagedConsoleFrame>/);
  for (const file of [
    'frontend/public/admin/host-config.js',
    '.output/public/admin/js/shell.js',
    '.output/public/ecommerce-cms-agentsam/admin/home.html'
  ]) assert.ok(existsSync(new URL('../' + file, import.meta.url)), file);
});

test('Local Studio owns exactly one navigation surface without nested Ecommerce shell', () => {
  const root = readFileSync(new URL('../frontend/src/routes/__root.tsx', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../frontend/agentsam/AgentSamShell.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(root, /PackagedConsoleFrame/);
  assert.match(root, /<AgentSamShell \/>/);
  assert.equal((shell.match(/<Nav\.Sidenav \/>/g) || []).length, 1);
  assert.doesNotMatch(shell, /includeMobileDrawer|renderShell\(/);
  assert.doesNotMatch(shell, /href: '\/cli'/);
  assert.match(shell, /defaultOpen peekable/);
  assert.match(shell, /label: 'AgentSam'/);
  assert.match(shell, /<SideStage workFocused=\{globalAssistantFocused\}/);
  assert.match(shell, /!isConversation && state.sideOpen/);
  assert.match(shell, /<Nav\.Topbar className="platform-console-topbar">/);

  const css = readFileSync(new URL('../frontend/agentsam/platform-console.css', import.meta.url), 'utf8');
  assert.match(css, /--nav-width: 246px/);
});

test('platform home is a real SaaS route separate from Ecommerce home.html', () => {
  const worker = readFileSync(new URL('../backend/worker/index.js', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../frontend/src/routes/(apps)/admin/home.tsx', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../frontend/src/routes/index.tsx', import.meta.url), 'utf8');
  assert.match(worker, /url\.pathname !== "\/admin\/home"/);
  assert.match(route, /component: LocalStudioHome/);
  assert.match(home, /export function LocalStudioHome/);
  assert.match(home, /Your activity/);
  assert.doesNotMatch(home, /Your store is taking shape|Fuel & Free Time/);
});

test('AgentSam app and approved Ecommerce groups keep their actual route ownership', () => {
  const source = readFileSync(new URL('../frontend/public/admin/host-config.js', import.meta.url), 'utf8');
  const context = {
    NAV: { main: [], channels: [], apps: [] },
    renderSideNav: () => '<nav></nav>',
    localStorage: { getItem: () => 'dark', setItem: () => {} },
    CONSOLE_APPEARANCE_KEY: 'console-appearance',
    window: { __AGENTSAM_DESKTOP__: false },
  };
  runInNewContext(source, context);
  assert.equal(context.NAV.main[0].href, '/admin/home');
  assert.equal(context.NAV.main.some((item) => item.href === '/agentsam'), false);
  assert.equal(context.NAV.apps.filter((item) => item.href === '/agentsam').length, 1);
  assert.equal(context.NAV.apps.find((item) => item.href === '/agentsam').label, 'AgentSam');
  assert.equal(context.NAV.apps.some((item) => item.href === '/cli'), false);
  const products = context.NAV.main.find((item) => item.id === 'products');
  const productPaths = new Set(products.children.map((item) => item.href));
  for (const path of ['/admin/products/create', '/admin/products/help/artwork',
    '/admin/products', '/admin/inventory', '/admin/orders', '/admin/discounts']) {
    assert.ok(productPaths.has(path), path);
  }
  const analytics = context.NAV.main.find((item) => item.id === 'analytics');
  assert.deepEqual(Array.from(analytics.children, (entry) => entry.href), [
    '/admin/analytics/overview', '/admin/analytics/finance', '/admin/analytics/health'
  ]);
  const channelPaths = context.NAV.channels.flatMap((section) =>
    (section.children || []).map((item) => item.href.split('?')[0]));
  for (const path of ['/admin/pages', '/admin/theme-editor', '/admin/preferences', '/admin/subscribers']) {
    assert.ok(channelPaths.includes(path), path);
  }
  assert.equal(context.NAV.channels.find((section) => section.id === 'audience').children[0].label, 'Subscribers');
  assert.equal(context.NAV.apps.some((entry) => entry.id === 'email'), true);
  const installedPaths = [
    ...context.NAV.main.flatMap((item) => [item.href, ...(item.children || []).map((entry) => entry.href)]),
    ...channelPaths,
    ...context.NAV.apps.flatMap((item) => (item.children || []).map((entry) => entry.href)),
  ].filter(Boolean);
  for (const path of installedPaths.filter((item) => item.startsWith('/admin/'))) {
    assert.ok(resolveConsoleFile(path.split('?')[0]), 'Packaged route missing: ' + path);
  }
});

test('Growth appearance is a host-only, theme-token override', () => {
  const css = readFileSync(new URL('../frontend/public/console-growth-host.css', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../frontend/public/admin/host-config.js', import.meta.url), 'utf8');
  assert.match(css, /--c-accent/);
  assert.match(css, /--c-focus/);
  assert.doesNotMatch(css, /#ff6a00|#e96000/i);
  assert.match(config, /location\?\.pathname === "\/admin\/growth"/);
  assert.match(config, /\/console-growth-host\.css/);
});

test('legacy /cli opens an existing AgentSam side-panel terminal', () => {
  const source = readFileSync(new URL('../frontend/src/routes/(apps)/cli.tsx', import.meta.url), 'utf8');
  assert.match(source, /openSideTab\("terminal"/);
  assert.match(source, /setSideOpen\(true\)/);
  assert.match(source, /"\/agentsam"/);
  assert.doesNotMatch(source, /TerminalPane variant="page"/);
});

test('desktop Console links resolve to real platform or installed Ecommerce app routes', () => {
  const source = readFileSync(new URL('../frontend/public/admin/host-config.js', import.meta.url), 'utf8');
  let click;
  const context = {
    NAV: { main: [], channels: [], apps: [] },
    renderSideNav: () => '<nav></nav>',
    localStorage: { getItem: () => 'dark' },
    CONSOLE_APPEARANCE_KEY: 'appearance',
    window: { __AGENTSAM_DESKTOP__: true, location: { hash: '' } },
    document: { addEventListener: (_name, handler) => { click = handler; } },
    encodeURIComponent,
  };
  runInNewContext(source, context);
  assert.equal(typeof click, 'function');
  const visit = (path) => {
    let prevented = false;
    click({
      target: { closest: () => ({ getAttribute: () => path }) },
      defaultPrevented: false,
      preventDefault: () => { prevented = true; },
      metaKey: false, ctrlKey: false, altKey: false, shiftKey: false,
    });
    assert.equal(prevented, true);
    return context.window.location.hash;
  };
  assert.equal(visit('/admin/home'), '#/');
  assert.equal(visit('/admin/agentsam'), '#/agentsam');
  assert.equal(visit('/cad'), '#/cad');
  assert.equal(visit('/admin/products'), '#/apps/ecommerce-cms-agentsam?page=%2Fadmin%2Fproducts');
  assert.equal(visit('/admin/theme-editor?slug=home'), '#/apps/ecommerce-cms-agentsam?page=%2Fadmin%2Ftheme-editor%3Fslug%3Dhome');
});
