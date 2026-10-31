import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { resolveConsoleFile, servePackagedConsole } from '../backend/worker/packaged-console.js';
import { canonicalStudioPath, isStudioAdminPath } from '../shared/studio-admin-routes.mjs';
import { handleStudioAccountAvatar } from '../backend/worker/studio-user-preferences.js';

test('platform routes resolve to the real Ecommerce application bundle', () => {
  for (const [path, file] of [
    ['/admin/store', 'store.html'],
    ['/admin/pages', 'pages.html'],
    ['/admin/theme-editor', 'theme-editor.html'],
    ['/admin/css/console.css', 'css/console.css'],
    ['/admin/js/shell.js', 'js/shell.js'],
    ['/admin/partials/growth-app.html', 'partials/growth-app.html'],
    ['/admin/analytics/overview', '_spa/index.html'],
  ]) assert.equal(resolveConsoleFile(path), file, path);
  assert.equal(resolveConsoleFile('/admin/home'), null, 'Studio owns the top-level home entry');
  assert.equal(resolveConsoleFile('/admin/home', { allowEmbeddedHome: true }), 'home.html', 'only the installed-app frame may request the packaged home');
  for (const path of ['/sites', '/api/admin/me', '/admin/../../secret', '/admin/unknown']) {
    assert.equal(resolveConsoleFile(path), null, path);
  }
});
test('canonical Studio Home serves the existing packaged dashboard with the shared host shell', async () => {
  const seen = [];
  const assets = { fetch(request) {
    seen.push(new URL(request.url).pathname);
    return Promise.resolve(new Response('<html><head></head><body><script src="/admin/js/shell.js"></script>home</body></html>', {
      headers: { 'content-type': 'text/html' },
    }));
  } };
  const response = await servePackagedConsole(
    new Request('https://agentsam.inneranimalmedia.com/admin/home'),
    assets,
    { allowStudioHome: true },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(seen, ['/ecommerce-cms-agentsam/admin/home']);
  const html = await response.text();
  assert.match(html, /host-config\.js/);
  assert.match(html, /home/);
});

test('Worker serves packaged assets, not a customer Worker or a reconstructed shell', async () => {
  const seen = [];
  const env = { fetch(req) {
    seen.push(new URL(req.url).pathname);
    return Promise.resolve(new Response('<html><head></head><body><script src="/admin/js/shell.js"></script>product</body></html>', { headers: { 'content-type':'text/html' } }));
  } };
  const res = await servePackagedConsole(new Request('https://agentsam.inneranimalmedia.com/admin/home?__agentsamEmbedded=1'), env);
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
  assert.match(worker, /url\.pathname === "\/admin\/home"[\s\S]{0,650}guardStudioDocument\(request, env\)[\s\S]{0,650}allowStudioHome: true/);
  const cloudflare = readFileSync(new URL('../backend/wrangler.jsonc', import.meta.url), 'utf8');
  // wrangler.jsonc allows comments/trailing commas; parse the route array,
  // not the entire JSONC document with JSON.parse.
  const workerFirstMatch = cloudflare.match(/"run_worker_first":\s*(\[[^\]]+\])/);
  assert.ok(workerFirstMatch, 'run_worker_first missing');
  const runWorkerFirst = JSON.parse(workerFirstMatch[1]);
  for (const route of ['/admin/*', '/sites', '/samsketch', '/projects', '/projects/*']) {
    assert.ok(runWorkerFirst.includes(route), 'Worker must own route: ' + route);
  }

  const app = readFileSync(new URL('../frontend/src/routes/__root.tsx', import.meta.url), 'utf8');
  assert.match(app, /return \(isApp \|\| isStudioAdminPath\(pathname\)\) \? <PackagedConsoleFrame><AgentSamShell embedded \/><\/PackagedConsoleFrame> : <Outlet \/>/);
  assert.match(app, /title="AgentSam home"/);
  for (const file of [
    'frontend/public/admin/host-config.js',
    '.output/public/admin/js/shell.js',
    '.output/public/ecommerce-cms-agentsam/admin/home.html'
  ]) assert.ok(existsSync(new URL('../' + file, import.meta.url)), file);
});

test('Local Studio owns exactly one navigation surface without nested Ecommerce shell', () => {
  const root = readFileSync(new URL('../frontend/src/routes/__root.tsx', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../frontend/agentsam/AgentSamShell.tsx', import.meta.url), 'utf8');
  assert.match(root, /PackagedConsoleFrame/);
  assert.match(root, /<AgentSamShell embedded \/>/);
  assert.equal((shell.match(/<Nav\.Sidenav \/>/g) || []).length, 1);
  assert.doesNotMatch(shell, /includeMobileDrawer|renderShell\(/);
  assert.doesNotMatch(shell, /href: '\/cli'/);
  assert.match(shell, /defaultOpen resizable/);
  assert.doesNotMatch(shell, /defaultOpen peekable/);
  assert.match(shell, /fetch\('\/admin\/data\/navigation\.json'/);
  assert.match(shell, /navigation\.primary/);
  assert.match(shell, /navigation\.channels/);
  assert.match(shell, /navigation\.utilities/);
  assert.match(shell, /showSidebarHeader: false/);
  assert.doesNotMatch(shell, /id: 'cad', label: 'CAD Creator'/);
  assert.match(shell, /<SideStage workFocused=\{globalAssistantFocused\}/);
  assert.match(shell, /!isConversation && state.sideOpen/);
  assert.match(shell, /<Nav\.Topbar className="platform-console-topbar">/);

  const css = readFileSync(new URL('../frontend/agentsam/platform-console.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /--nav-(?:width|rail-width):/, "Navigation geometry stays with agentsam-nav");
});

test('admin home resolves to the packaged Ecommerce home on Local Studio', () => {
  const worker = readFileSync(new URL('../backend/worker/index.js', import.meta.url), 'utf8');
  const root = readFileSync(new URL('../frontend/src/routes/__root.tsx', import.meta.url), 'utf8');
  assert.match(root, /src="\/ecommerce-cms-agentsam\/admin\/home\.html"/);
  assert.match(worker, /handleEcommerceAdminApi/);
  assert.match(worker, /handleCompletefulWebhook/);
});

test('AgentSam app and approved Ecommerce groups keep their actual route ownership', async () => {
  const source = readFileSync(new URL('../frontend/public/admin/host-config.js', import.meta.url), 'utf8');
  const projection = JSON.parse(readFileSync(new URL('../frontend/public/admin/data/navigation.json', import.meta.url), 'utf8'));
  const requested = [];
  const context = {
    NAV: { main: [], channels: [], apps: [] },
    renderSideNav: () => '<nav></nav>',
    localStorage: { getItem: () => 'dark', setItem: () => {} },
    CONSOLE_APPEARANCE_KEY: 'console-appearance',
    document: { querySelectorAll: () => [], addEventListener: () => {} },
    window: { __AGENTSAM_DESKTOP__: false, fetch: async (url) => {
      requested.push(url);
      return { ok: true, json: async () => projection };
    } },
  };
  runInNewContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(requested, ['/admin/data/navigation.json']);
  assert.deepEqual(Array.from(context.NAV.apps, (item) => item.id), projection.apps.map((item) => item.id));
  assert.equal(context.NAV.main[0].href, '/admin/home');
  assert.equal(context.NAV.main.some((item) => item.href === '/agentsam'), false);
  assert.equal(context.NAV.apps.filter((item) => item.href === '/admin/agentsam').length, 1);
  assert.equal(context.NAV.apps.find((item) => item.href === '/admin/agentsam').label, 'AgentSam');
  assert.equal(context.NAV.apps.some((item) => item.href === '/browse' || item.href === '/media'), false);
  assert.equal(context.NAV.apps.some((item) => item.id === 'samsketch' && item.href === '/samsketch'), true);
  assert.equal(context.NAV.apps.some((item) => item.href === '/admin/moviemode'), true);
  assert.equal(context.NAV.apps.some((item) => item.href === '/admin/cad'), true);
  assert.equal(context.NAV.apps.some((item) => item.href === '/cli'), false);
  assert.equal(context.NAV.apps.some((item) => item.id === 'ecommerce-cms-agentsam'), false);
  assert.equal(context.NAV.apps.some((item) => item.href === '/admin/growth'), true);
  const products = context.NAV.main.find((item) => item.id === 'products');
  assert.equal(products.href, '/admin/products');
  assert.deepEqual(Array.from(products.children, (item) => [item.label, item.href]), [
    ['Product Studio', '/admin/products/create'],
    ['Store products', '/admin/products?view=store'],
    ['Collections', '/admin/products?view=collections'],
    ['Platform products', '/admin/products?view=platform'],
    ['Artwork Help', '/admin/products/help/artwork'],
    ['Inventory', '/admin/inventory'], ['Orders', '/admin/orders'],
    ['Discounts', '/admin/discounts'],
  ]);
  const analytics = context.NAV.main.find((item) => item.id === 'analytics');
  assert.equal(analytics.href, '/admin/analytics/overview');
  assert.deepEqual(Array.from(analytics.children, (entry) => entry.href), [
    '/admin/analytics/finance', '/admin/analytics/health'
  ]);
  const content = context.NAV.main.find((item) => item.id === 'content');
  assert.equal(content.href, '/admin/content');
  assert.deepEqual(Array.from(content.children, (entry) => entry.href), [
    '/admin/content?kind=image', '/admin/content?kind=video',
  ]);
  const channelPaths = context.NAV.channels.flatMap((section) =>
    [section.href, ...(section.children || []).map((item) => item.href)].filter(Boolean).map((href) => href.split('?')[0]));
  assert.deepEqual(Array.from(context.NAV.channels, (item) => [item.label, item.href]), [
    ['Online Store', '/admin/store'], ['Audience', '/admin/subscribers']
  ]);
  assert.equal(context.NAV.channels.find((section) => section.id === 'audience').children, undefined);
  assert.deepEqual(Array.from(context.NAV.utilities), []);
  assert.match(source, /id:'account',label:'Account'/);
  assert.doesNotMatch(source, /id: 'appearance'|id: 'integrations'/);
  const docs = readFileSync(new URL('../frontend/src/routes/(apps)/docs.tsx', import.meta.url), 'utf8');
  assert.match(docs, /href="\/admin\/products\/help\/artwork"/);
  // Curated discovery does not retire existing product/editor/help URLs.
  assert.equal(resolveConsoleFile('/admin/products/create'), '_spa/index.html');
  assert.equal(resolveConsoleFile('/admin/products/help/artwork'), '_spa/index.html');
  assert.equal(context.NAV.apps.some((entry) => entry.id === 'work-mail' || entry.href === '/mail'), false);
  const installedPaths = [
    ...context.NAV.main.flatMap((item) => [item.href, ...(item.children || []).map((entry) => entry.href)]),
    ...channelPaths,
    ...context.NAV.apps.flatMap((item) => (item.children || []).map((entry) => entry.href)),
  ].filter(Boolean);
  for (const path of installedPaths.filter((item) => item.startsWith('/admin/'))) {
    assert.ok(isStudioAdminPath(path.split('?')[0]) || resolveConsoleFile(path.split('?')[0]), 'Unowned admin route: ' + path);
  }
});

test('Studio-owned admin URLs reuse existing apps and preserve flat compatibility routes', () => {
  for (const [oldPath, currentPath] of [
    ['/agentsam', '/admin/agentsam'],
    ['/cad', '/admin/cad'],
    ['/samsketch', '/admin/cad'],
    ['/media', '/admin/moviemode'],
    ['/media/edit', '/admin/moviemode/edit'],
  ]) assert.equal(canonicalStudioPath(oldPath), currentPath);
  for (const path of ['/admin/agentsam', '/admin/cad', '/admin/moviemode', '/admin/projects']) {
    assert.ok(isStudioAdminPath(path), path);
  }
  assert.equal(isStudioAdminPath('/admin/products'), false);
  assert.equal(isStudioAdminPath('/admin/theme-editor'), false);
  const worker = readFileSync(new URL('../backend/worker/index.js', import.meta.url), 'utf8');
  assert.match(worker, /!isStudioAdminPath\(url\.pathname\)/);
  assert.match(worker, /import \{ canonicalStudioPath, isStudioAdminPath \} from [^;]+studio-admin-routes\.mjs/);
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
  assert.equal(visit('/admin/home'), '#/apps/ecommerce-cms-agentsam?page=%2Fadmin%2Fhome');
  assert.equal(visit('/admin/agentsam'), '#/admin/agentsam');
  assert.equal(visit('/admin/cad'), '#/admin/cad');
  assert.equal(visit('/admin/moviemode'), '#/admin/moviemode');
  assert.equal(visit('/cad'), '#/cad');
  assert.equal(visit('/admin/products'), '#/apps/ecommerce-cms-agentsam?page=%2Fadmin%2Fproducts');
  assert.equal(visit('/admin/theme-editor?slug=home'), '#/apps/ecommerce-cms-agentsam?page=%2Fadmin%2Ftheme-editor%3Fslug%3Dhome');
});


test('AgentSam app persists authenticated avatar preference without new tables', async () => {
  let json = '{"settings_general":{"openLastProject":true}}';
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() { return { ui_preferences_json: json }; },
              async run() { json = args[1]; return { success: true }; }
            };
          }
        };
      }
    }
  };
  const url = 'https://agentsam.inneranimalmedia.com/api/settings/account-avatar';
  const guest = await handleStudioAccountAvatar(new Request(url), env, null);
  assert.equal(guest.status, 401);
  const put = await handleStudioAccountAvatar(new Request(url, {
    method: 'PUT', headers: { 'content-type': 'application/json', origin: 'https://agentsam.inneranimalmedia.com' },
    body: JSON.stringify({ avatar_url: '/brand/agentsam-gorilla/v1/pet/ledge/ledge-idle.svg' })
  }), env, 'signed-in-user');
  assert.equal(put.status, 200);
  const get = await handleStudioAccountAvatar(new Request(url), env, 'signed-in-user');
  assert.equal((await get.json()).avatar_url, '/brand/agentsam-gorilla/v1/pet/ledge/ledge-idle.svg');
  assert.equal(JSON.parse(json).settings_general.openLastProject, true, 'other preferences survive');
  const reject = await handleStudioAccountAvatar(new Request(url, {
    method: 'PUT', headers: { 'content-type':'application/json' },
    body: '{"avatar_url":"javascript:alert(1)"}'
  }), env, 'signed-in-user');
  assert.equal(reject.status, 400);
});


test('hosted AgentSam keeps the Ecommerce topbar and moves Chat/Work into the welcome viewport', () => {
  const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
  const ecommerce = read('../../ecommerce-cms-agentsam/frontend/shell.js');
  const headerCSS = read('../frontend/agentsam/packaged-console-frame.css');
  const workspace = read('../frontend/agentsam/AgentSamPage.tsx');
  const host = read('../frontend/agentsam/PackagedConsoleFrame.tsx');
  const pet = read('../frontend/agentsam/AgentSamPetTrigger.tsx');
  assert.match(ecommerce, /id="agentsam-console-mode-slot"/);
  assert.match(ecommerce, /id="console-search-trigger"/);
  assert.match(ecommerce, /id="console-notifications-trigger"/);
  assert.match(ecommerce, /id="console-notifications-menu"/);
  assert.match(workspace, /empty \? <div className="agentsam-welcome-mode-bar"/);
  assert.match(workspace, /<Nav\.ModeSwitcher \/>/);
  assert.doesNotMatch(workspace, /createPortal\(<Nav\.Scope className="agentsam-mode-host"/);
  assert.match(host, /event\.stopImmediatePropagation\(\)/);
  assert.match(host, /agentsam:assistant:activate/);
  assert.doesNotMatch(headerCSS, /body\.agentsam-conversation-route \.console-topbar \{ display: none/);
  assert.match(headerCSS, /\.agentsam-page-layout > \.as-nav-topbar \{ display: none/);
  assert.doesNotMatch(pet, />Ask AgentSam<\/span>/);
});


test('CAD inherits the full hosted canvas height without another global sidebar', () => {
  const css = readFileSync(new URL('../frontend/agentsam/packaged-console-frame.css', import.meta.url), 'utf8');
  const frame = readFileSync(new URL('../frontend/src/routes/(apps)/cad.tsx', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../frontend/agentsam/AgentSamShell.tsx', import.meta.url), 'utf8');
  assert.match(css, /\.agentsam-route:has\(\[data-cad-studio-host\]\) \{\s*position: relative/);
  assert.match(css, /\[data-cad-studio-host\] \{\s*position: absolute;\s*inset: 0/);
  assert.match(css, /\[data-cad-iframe-region\] iframe \{\s*position: absolute;\s*inset: 0/);
  assert.match(frame, /data-cad-studio-host/);
  assert.match(frame, /data-cad-editor-stage/);
  assert.match(frame, /data-cad-iframe-region/);
  assert.match(frame, /className="absolute inset-0 block h-full w-full border-0"/);
  assert.match(frame, /presentation=embedded|cadEmbeddedUrl/);
  assert.match(shell, /!embedded \? <Nav\.Sidenav \/>/);
});

test('embedded desktop navigation reaches its parent and API requests use the native host', async () => {
  const source = readFileSync(new URL('../frontend/public/admin/host-config.js', import.meta.url), 'utf8');
  const events=[]; const destinations=[]; const requests=[];
  const bridge={
    navigate:path=>destinations.push(path),
    activateAssistant:()=>{},
    request:async request=>{requests.push(request.url);return new Response('{"ok":true}');},
  };
  const context={
    NAV:{main:[],channels:[],apps:[]}, renderSideNav:()=>'<nav></nav>',
    CONSOLE_APPEARANCE_KEY:'appearance', localStorage:{getItem:()=> 'dark'},
    Request,Response,URL,encodeURIComponent,
    window:{parent:{agentsamConsoleHost:bridge},location:{origin:'https://native.test',href:'https://native.test/admin/products.html',hash:''},fetch:async()=>{throw Error('wrong cookie transport');}},
    document:{addEventListener:(_name,handler)=>events.push(handler)},
  };
  runInNewContext(source,context);
  const visit=(path,target=null)=>{
    const link={getAttribute:name=>name==='href'?path:target,hasAttribute:()=>false};
    const event={target:{closest:selector=>selector==='a[href]'?link:null},defaultPrevented:false,preventDefault(){}};
    for(const handler of events) handler(event);
  };
  visit('/admin/agentsam');
  visit('/mail');
  visit('/admin/products?view=collections');
  visit('/admin/products','_blank');
  visit('https://other.example/admin/products');
  assert.deepEqual(destinations,['/admin/agentsam','/mail','/apps/ecommerce-cms-agentsam?page=%2Fadmin%2Fproducts%3Fview%3Dcollections']);
  assert.equal(context.window.location.hash,'');
  assert.equal((await (await context.window.fetch('https://native.test/api/admin/products')).json()).ok,true);
  assert.deepEqual(requests,['https://native.test/api/admin/products']);
});
