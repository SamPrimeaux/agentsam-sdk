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
test('immutable product sources and packaged shell are the authority', () => {
  const worker = readFileSync(new URL('../backend/worker/index.js', import.meta.url), 'utf8');
  assert.match(worker, /servePackagedConsole/);
  const cloudflare = readFileSync(new URL('../backend/wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(cloudflare, /"run_worker_first": \["\/admin\/\*", "\/sites", "\/samsketch"\]/);

  const app = readFileSync(new URL('../frontend/src/routes/__root.tsx', import.meta.url), 'utf8');
  assert.match(app, /<PackagedConsoleFrame><AgentSamShell embedded/);
  for (const file of [
    'frontend/public/admin/host-config.js',
    '.output/public/admin/js/shell.js',
    '.output/public/ecommerce-cms-agentsam/admin/home.html'
  ]) assert.ok(existsSync(new URL('../' + file, import.meta.url)), file);
});

test('the packaged Console owns exactly one visible navigation surface', () => {
  const frame = readFileSync(new URL('../frontend/agentsam/PackagedConsoleFrame.tsx', import.meta.url), 'utf8');
  assert.match(frame, /render\(pathname,.*fullBleed: true/);
  assert.doesNotMatch(frame, /includeMobileDrawer: true/);
  const shell = readFileSync(new URL('../frontend/agentsam/AgentSamShell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /!isSettings && !embedded \? <Nav\.Sidenav/);
});

test('AgentSam is an installed app, and Ecommerce destinations stay in Sites', () => {
  const source = readFileSync(new URL('../frontend/public/admin/host-config.js', import.meta.url), 'utf8');
  const context = {
    NAV: { main: [], channels: [], apps: [] },
    renderSideNav: () => '<nav></nav>',
    localStorage: { getItem: () => 'dark', setItem: () => {} },
    CONSOLE_APPEARANCE_KEY: 'console-appearance',
    window: { __AGENTSAM_DESKTOP__: false },
  };
  runInNewContext(source, context);
  assert.equal(context.NAV.main.some((item) => item.href === '/agentsam'), false);
  assert.equal(context.NAV.apps.filter((item) => item.href === '/agentsam').length, 1);
  assert.equal(context.NAV.apps.find((item) => item.href === '/agentsam').label, 'AgentSam');
  assert.equal(context.NAV.apps.some((item) => item.href === '/cli'), false);
  const routes = new Set(context.NAV.channels.flatMap((section) =>
    (section.children || []).map((item) => item.href.split('?')[0])));
  for (const path of ['/admin/pages', '/admin/theme-editor', '/admin/products',
    '/admin/products/create', '/admin/inventory', '/admin/orders', '/admin/content',
    '/admin/growth', '/admin/analytics/overview', '/admin/preferences']) {
    assert.ok(routes.has(path), path);
    assert.ok(resolveConsoleFile(path), 'Packaged route missing: ' + path);
  }
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
