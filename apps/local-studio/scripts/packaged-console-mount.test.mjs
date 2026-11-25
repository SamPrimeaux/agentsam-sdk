import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { resolveConsoleFile, servePackagedConsole } from '../backend/worker/packaged-console.js';
import { canonicalStudioPath, isStudioAdminPath, isStudioShellAdminPath } from '../shared/studio-admin-routes.mjs';
import { studioNavigationProjection } from './studio-navigation.mjs';

test('platform routes resolve to the real Ecommerce application bundle', () => {
  for (const [path, file] of [
    ['/admin/pages', 'pages.html'],
    ['/admin/sites/site_a/pages/page_a/editor', 'theme-editor.html'],
    ['/admin/css/console.css', 'css/console.css'],
    ['/admin/js/shell.js', 'js/shell.js'],
    ['/admin/partials/growth-app.html', 'partials/growth-app.html'],
    ['/admin/analytics/overview', '_spa/index.html'],
  ]) assert.equal(resolveConsoleFile(path), file, path);
  assert.equal(resolveConsoleFile('/admin/home'), null, 'Studio owns the top-level home entry');
  assert.equal(resolveConsoleFile('/admin/store'), null, 'Studio owns the canonical store route');
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
  for (const route of ['/admin', '/admin/*', '/sites', '/samsketch', '/projects', '/projects/*']) {
    assert.ok(runWorkerFirst.includes(route), 'Worker must own route: ' + route);
  }

  const app = readFileSync(new URL('../frontend/src/routes/__root.tsx', import.meta.url), 'utf8');
  assert.match(app, /return \(isApp \|\| isStudioShellAdminPath\(pathname\)\) \? <PackagedConsoleFrame><AgentSamShell embedded \/><\/PackagedConsoleFrame> : <Outlet \/>/);
  assert.match(app, /pathname === "\/admin\/home"/);
  for (const file of [
    'frontend/public/admin/host-config.js',
    '../ecommerce-cms-agentsam/frontend/shell.js',

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
  assert.match(shell, /defaultOpen mobileBreakpoint=\{901\} resizable/);
  assert.doesNotMatch(shell, /defaultOpen peekable/);
  assert.doesNotMatch(shell, /fetch\('\/admin\/data\/navigation\.json'/, 'static manifest data must not bypass account installation checks');
  assert.match(shell, /navigation\.primary/);
  assert.match(shell, /navigation\.channels/);
  assert.match(shell, /navigation\.utilities/);
  assert.match(shell, /\{!embedded \? <Nav\.Sidenav \/> : null\}/);
  assert.doesNotMatch(shell, /id: 'cad', label: 'CAD Creator'/);
  assert.match(shell, /<SideStage workFocused=\{globalAssistantFocused\}/);
  assert.match(shell, /!isConversation && !isCanvasRoute && state\.sideOpen/);
  assert.match(shell, /<Nav\.Topbar className="platform-console-topbar">/);

  const css = readFileSync(new URL('../frontend/agentsam/platform-console.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /--nav-(?:width|rail-width):/, "Navigation geometry stays with agentsam-nav");
});

test('admin home resolves to the packaged Ecommerce home on Local Studio', () => {
  const worker = readFileSync(new URL('../backend/worker/index.js', import.meta.url), 'utf8');
  const root = readFileSync(new URL('../frontend/src/routes/__root.tsx', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../frontend/agentsam/AgentSamShell.tsx', import.meta.url), 'utf8');
  assert.match(root, /pathname === "\/admin\/home"/);
  assert.match(shell, /title="AgentSam admin home" src="\/ecommerce-cms-agentsam\/admin\/home\.html\?__agentsamEmbedded=1"/);
  assert.match(worker, /handleEcommerceAdminApi/);
  assert.match(worker, /handleCompletefulWebhook/);
});

test('AgentSam app and approved Ecommerce groups keep their actual route ownership', async () => {
  const source = readFileSync(new URL('../frontend/public/admin/host-config.js', import.meta.url), 'utf8');
  const projection = studioNavigationProjection();
  const requested = [];
  const context = {
    NAV: { main: [], channels: [], apps: [] },
    renderSideNav: () => '<nav></nav>',
    localStorage: { getItem: () => 'dark', setItem: () => {} },
    CONSOLE_APPEARANCE_KEY: 'console-appearance',
    document: { querySelectorAll: () => [], addEventListener: () => {} },
    window: { __AGENTSAM_DESKTOP__: false, addEventListener: () => {}, fetch: async (url) => {
      requested.push(url);
      return { ok: true, json: async () => projection };
    } },
  };
  runInNewContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(requested, ['/api/studio/navigation','/api/notifications?limit=1']);
  assert.deepEqual(Array.from(context.NAV.apps, (item) => item.id), projection.apps.map((item) => item.id));
  assert.equal(context.NAV.main[0].href, '/admin/home');
  assert.equal(context.NAV.main.some((item) => item.href === '/agentsam'), false);
  assert.equal(context.NAV.apps.filter((item) => item.href === '/admin/agentsam').length, 1);
  assert.equal(context.NAV.apps.find((item) => item.href === '/admin/agentsam').label, 'AgentSam');
  assert.equal(context.NAV.apps.some((item) => item.href === '/admin/browse'), false);
  assert.equal(context.NAV.apps.some((item) => item.href === '/admin/media'), false, 'MovieMode must not claim /media');
  assert.equal(context.NAV.apps.some((item) => item.id === 'samsketch' && item.href === '/admin/samsketch'), true);
  assert.equal(context.NAV.apps.some((item) => item.href === '/admin/moviemode'), true);
  assert.equal(context.NAV.apps.some((item) => item.href === '/admin/cad'), true);
  assert.equal(context.NAV.apps.some((item) => item.href === '/admin/cli'), false);
  assert.equal(context.NAV.apps.some((item) => item.id === 'ecommerce-cms-agentsam'), false);
  // Growth is an Audience child screen, not a second top-level app launcher.
  const audienceProjection = projection.channels.find((item) => item.id === 'audience');
  assert.equal(audienceProjection?.children.some(item => item.app_id === 'agentsam-app-growth' && item.href === '/admin/growth'), true);
  assert.equal(context.NAV.main.some((item) => item.id === 'products'), false, 'Products live under Sales channels');
  const library = context.NAV.main.find((item) => item.id === 'library' || item.id === 'media');
  assert.equal(library.href, '/media');
  assert.equal(library.label, 'Library');
  assert.deepEqual(Array.from(library.children, (item) => item.href), ['/media/images','/media/videos','/media/models','/media/files']);
  const analytics = context.NAV.main.find((item) => item.id === 'analytics');
  assert.equal(analytics.href, '/admin/analytics/overview');
  assert.deepEqual(Array.from(analytics.children, (entry) => entry.href), [
    '/admin/analytics/finance', '/admin/analytics/health'
  ]);
  const channelPaths = context.NAV.channels.flatMap((section) =>
    [section.href, ...(section.children || []).map((item) => item.href)].filter(Boolean).map((href) => href.split('?')[0]));
  assert.deepEqual(Array.from(context.NAV.channels, (item) => [item.label, item.href]), [
    ['Online Store', '/admin/store'], ['Products', '/admin/products'], ['Audience', '/admin/subscribers']
  ]);
  const products = context.NAV.channels.find((item) => item.id === 'products');
  assert.deepEqual(Array.from(products.children, (item) => [item.label, item.href]), [
    ['Collections', '/admin/collections'],
    ['Create', '/admin/products/create'],
    ['Inventory', '/admin/inventory'],
    ['Orders', '/admin/orders'],
    ['Discounts', '/admin/discounts'],
  ]);
  const audience = context.NAV.channels.find((section) => section.id === 'audience');
  assert.equal(audience.children?.[0]?.href, '/admin/growth');
  assert.deepEqual(Array.from(context.NAV.utilities), []);
  assert.match(source, /id:'account',label:'Account'/);
  assert.doesNotMatch(source, /id: 'appearance'|id: 'integrations'/);
  const docs = readFileSync(new URL('../frontend/src/routes/(apps)/admin/docs.tsx', import.meta.url), 'utf8');
  assert.match(docs, /\/admin\/settings\/docs/);
  // Curated discovery does not retire existing product/editor URLs.
  assert.equal(resolveConsoleFile('/admin/products/create'), '_spa/index.html');
  assert.equal(context.NAV.apps.some((entry) => entry.id === 'work-mail' || entry.href === '/admin/mail'), false);
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
  ]) assert.equal(canonicalStudioPath(oldPath), currentPath);
  assert.equal(canonicalStudioPath('/samsketch'), '/admin/samsketch', 'SamSketch receives its canonical admin mount');
  assert.equal(canonicalStudioPath('/samsculpt'), null, 'SamSculpt owns /samsculpt when installed');
  assert.equal(canonicalStudioPath('/media'), '/admin/media', '/media remains the Media Library under admin');
  assert.equal(canonicalStudioPath('/admin/moviemode'), null);
  for (const path of ['/admin/agentsam', '/admin/cad', '/admin/moviemode', '/admin/projects']) {
    assert.ok(isStudioAdminPath(path), path);
  }
  assert.equal(isStudioAdminPath('/admin/products'), true);
  assert.equal(isStudioShellAdminPath('/admin/products'), false);
  assert.equal(resolveConsoleFile('/admin/theme-editor'), null, 'retired editor is not a document route');
  const worker = readFileSync(new URL('../backend/worker/index.js', import.meta.url), 'utf8');
  assert.match(worker, /!isStudioAdminPath\(url\.pathname\)/);
  assert.match(worker, /import \{ canonicalStudioPath, isStudioAdminPath, resolveLegacyContentMediaPath, STUDIO_ADMIN_PRERENDERED_ROUTES \} from [^;]+studio-admin-routes\.mjs/);
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
  const source = readFileSync(new URL('../frontend/src/routes/(apps)/admin/cli.tsx', import.meta.url), 'utf8');
  assert.match(source, /openSideTab\("terminal"/);
  assert.match(source, /setSideOpen\(true\)/);
  assert.match(source, /"\/admin\/agentsam"/);
  assert.doesNotMatch(source, /TerminalPane variant="page"/);
});

test('desktop Console links resolve to real platform or installed Ecommerce app routes', () => {
  const source = readFileSync(new URL('../frontend/public/admin/host-config.js', import.meta.url), 'utf8');
  const clicks = [];
  const context = {
    NAV: { main: [], channels: [], apps: [] },
    renderSideNav: () => '<nav></nav>',
    localStorage: { getItem: () => 'dark' },
    CONSOLE_APPEARANCE_KEY: 'appearance',
    window: { __AGENTSAM_DESKTOP__: true, location: { hash: '' } },
    document: { addEventListener: (name, handler) => { if (name === 'click') clicks.push(handler); } },
    encodeURIComponent,
  };
  runInNewContext(source, context);
  assert.ok(clicks.length > 0);
  const visit = (path) => {
    let prevented = false;
    for (const click of clicks) click({
      target: { closest: (selector) => selector === 'a[href]' ? { getAttribute: () => path } : null },
      defaultPrevented: false,
      preventDefault: () => { prevented = true; },
      metaKey: false, ctrlKey: false, altKey: false, shiftKey: false,
    });
    assert.equal(prevented, true);
    return context.window.location.hash;
  };
  assert.equal(visit('/admin/home'), '#/admin/home');
  assert.equal(visit('/admin/agentsam'), '#/admin/agentsam');
  assert.equal(visit('/admin/cad'), '#/admin/cad');
  assert.equal(visit('/admin/moviemode'), '#/admin/moviemode');
  assert.equal(visit('/cad'), '#/cad');
  assert.equal(visit('/admin/products'), '#/admin/apps/ecommerce-cms-agentsam?page=%2Fadmin%2Fproducts');
  assert.equal(resolveConsoleFile('/admin/theme-editor'), null, 'standalone entry is no longer mounted');
});





test('hosted AgentSam renders Chat/Work in its single packaged Console header', () => {
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
  assert.match(workspace, /hostModeSlot && empty \? createPortal\(<div className="agentsam-mode-host"><Nav\.ModeSwitcher \/><\/div>, hostModeSlot\)/);
  assert.match(workspace, /!hostModeSlot \? <Nav\.Topbar className="agentsam-conversation-topbar"/);
  assert.match(workspace, /empty \? <div className="agentsam-topbar-mode"><Nav\.ModeSwitcher \/><\/div>/);
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
  const frame = readFileSync(new URL('../frontend/src/routes/(apps)/admin/cad.tsx', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../frontend/agentsam/AgentSamShell.tsx', import.meta.url), 'utf8');
  assert.match(css, /\.agentsam-route:has\(\[data-cad-studio-host\]\),\s*#agentsam-host-workspace \.agentsam-route:has\(\[data-hosted-app-stage\]\) \{\s*position: relative/);
  assert.match(css, /\[data-cad-studio-host\],\s*#agentsam-host-workspace \[data-hosted-app-stage\] \{\s*position: absolute;\s*inset: 0/);
  assert.match(css, /\[data-cad-iframe-region\] iframe \{\s*position: absolute;\s*inset: 0/);
  assert.match(frame, /data-cad-studio-host/);
  assert.match(frame, /data-cad-editor-stage/);
  assert.match(frame, /data-cad-iframe-region/);
  assert.match(frame, /className="absolute inset-0 block h-full w-full border-0"/);
  assert.match(frame, /presentation=embedded|cadEmbeddedUrl/);
  assert.match(shell, /!embedded \? <Nav\.Sidenav \/>/);
});

test('SamSpeaks fills the existing hosted editor stage without a second shell or clipped iframe', () => {
  const css = readFileSync(new URL('../frontend/agentsam/packaged-console-frame.css', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../frontend/src/routes/(apps)/admin/samspeaks.tsx', import.meta.url), 'utf8');
  assert.match(route, /data-hosted-app-stage="samspeaks"/);
  assert.match(route, /className="relative flex size-full min-h-0 min-w-0 overflow-hidden bg-background"/);
  assert.match(route, /className="absolute inset-0 block size-full border-0"/);
  assert.match(route, /src="\/samspeaks\/"/);
  assert.match(css, /\.platform-console-stage:has\(\[data-hosted-app-stage\]\) \{\s*flex: 1 1 0%;\s*min-height: 0;\s*overflow: hidden/);
  assert.match(css, /\.agentsam-route:has\(\[data-hosted-app-stage\]\) \{\s*position: relative;\s*flex: 1 1 0%;/);
  assert.match(css, /\[data-hosted-app-stage\] \{\s*position: absolute;\s*inset: 0;[\s\S]*?height: 100%/);
  assert.doesNotMatch(route, /<Nav\.Provider|<Nav\.Sidenav|<Nav\.Topbar/);
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
    window:{parent:{agentsamConsoleHost:bridge},location:{origin:'https://native.test',href:'https://native.test/admin/products.html',hash:''},addEventListener:()=>{},fetch:async()=>{throw Error('wrong cookie transport');}},
    document:{addEventListener:(_name,handler)=>events.push(handler)},
  };
  runInNewContext(source,context);
  const visit=(path,target=null)=>{
    const link={getAttribute:name=>name==='href'?path:target,hasAttribute:()=>false};
    const event={target:{closest:selector=>selector==='a[href]'?link:null},defaultPrevented:false,preventDefault(){}};
    for(const handler of events) handler(event);
  };
  visit('/admin/agentsam');
  visit('/admin/mail');
  visit('/admin/products?view=collections');
  visit('/admin/products','_blank');
  visit('https://other.example/admin/products');
  assert.deepEqual(destinations,['/admin/agentsam','/admin/mail','/admin/apps/ecommerce-cms-agentsam?page=%2Fadmin%2Fproducts%3Fview%3Dcollections']);
  assert.equal(context.window.location.hash,'');
  assert.equal((await (await context.window.fetch('https://native.test/api/admin/products')).json()).ok,true);
  assert.deepEqual(requests,['https://native.test/api/admin/products']);
});

test('hosted product links update the same-origin containing app while preserving new-tab and external navigation',()=>{
  const source = readFileSync(new URL('../frontend/public/admin/host-config.js', import.meta.url),'utf8');
  const listeners=[]; const navigated=[];
  const parent={
    location:{origin:'https://studio.test',assign:path=>navigated.push(['assign',path])},
    dispatchEvent:(event)=>{ navigated.push(['navigate', event.detail?.to]); return true; },
  };
  const context={
    NAV:{main:[],channels:[],apps:[]},renderSideNav:()=>'<nav></nav>',
    localStorage:{getItem:()=>null},CONSOLE_APPEARANCE_KEY:'appearance',
    window:{parent,location:{origin:'https://studio.test',pathname:'/ecommerce-cms-agentsam/admin/home.html'}},
    document:{addEventListener:(name,fn)=>{if(name==='click')listeners.push(fn);}},
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    encodeURIComponent,
  };
  runInNewContext(source,context);
  const visit=(path,options={})=>{
    let prevented=false;
    const event={target:{closest:selector=>selector==='a[href]'?{
      getAttribute:key=>key==='href'?path:key==='target'?(options.target||null):null,
      hasAttribute:()=>false,
    }:null},button:0,defaultPrevented:false,
      preventDefault(){prevented=true;this.defaultPrevented=true;},stopImmediatePropagation(){},
      ...options};
    for(const listener of listeners)listener(event);
    return prevented;
  };
  assert.equal(visit('/admin/products'),true);
  assert.deepEqual(navigated,[['navigate','/admin/products']]);
  assert.equal(visit('/settings/general',{ctrlKey:true}),false);
  assert.equal(visit('/themes/violet/demo/',{target:'_blank'}),false);
  assert.equal(visit('//elsewhere.test/'),false);
  assert.equal(visit('https://elsewhere.test/'),false);
  assert.equal(visit('#section'),false);
  parent.location.origin='https://different.test';
  assert.equal(visit('/admin/content'),false);
  assert.deepEqual(navigated,[['navigate','/admin/products']]);
});


test('legacy R2 HTML source editor mounts only when explicitly selected', async () => {
  const env = {
    fetch() {
      return Promise.resolve(new Response('<html><head></head><body><script src="/admin/js/shell.js"></script>theme editor</body></html>', {
        headers: { 'content-type': 'text/html' },
      }));
    },
  };
  const canonical = await servePackagedConsole(
    new Request('https://agentsam.inneranimalmedia.com/admin/sites/site_a/pages/page_a/editor'),
    env,
  );
  assert.equal(canonical.status, 200);
  assert.doesNotMatch(await canonical.text(), /studio-cms-source-host/);

  const source = await servePackagedConsole(
    new Request('https://agentsam.inneranimalmedia.com/admin/sites/site_a/pages/page_a/editor?source=html'),
    env,
  );
  assert.equal(source.status, 200);
  assert.match(await source.text(), /studio-cms-source-host\.js/);
});


test('CMS product shell remains standalone but removes its own chrome only in an explicit host iframe', () => {
  const source = readFileSync(new URL('../../ecommerce-cms-agentsam/frontend/shell.js', import.meta.url), 'utf8');
  const match = source.match(/const SHELL_MODES = \{[\s\S]*?\n\};\n\nfunction resolveShellMode\(options = \{\}\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'product shell mode selection must remain testable');
  const mode = (search, inFrame, options = '{}') => {
    const browser = { location: { search } };
    browser.parent = inFrame ? {} : browser;
    return runInNewContext(match[0] + '\nresolveShellMode(' + options + ').id', {
      window: browser,
      URLSearchParams,
      ADMIN_EXIT_ROUTES: [],
    });
  };
  assert.equal(mode('', false), 'admin', 'standalone CMS keeps its complete navigation');
  assert.equal(mode('?__agentsamEmbedded=1', false), 'admin', 'query flag alone must not hide standalone navigation');
  assert.equal(mode('', true), 'admin', 'unflagged iframe remains a standalone product');
  assert.equal(mode('?__agentsamEmbedded=1', true), 'embedded-app', 'host owns navigation and Side Stage');
  assert.equal(mode('?__agentsamEmbedded=1', true, "{shellMode:'theme-editor'}"), 'theme-editor', 'focused editor keeps its native mode');
  assert.match(source, /if \(shellMode\.id !== "embedded-app"\) \{[\s\S]*?mountShellDock\(\)/);
  assert.match(source, /"admin-dock-off", fullBleed \|\| shellMode\.id === "embedded-app"/);
});


test('nested Media routes mount exactly one library through the router Outlet', () => {
  const parent = readFileSync(new URL('../frontend/src/routes/(apps)/admin/media.tsx', import.meta.url), 'utf8');
  assert.match(parent, /return atIndex \? <UnifiedLibraryPage view="media" \/> : <Outlet \/>/);
  for (const child of ['images', 'videos', 'models', 'files']) {
    const source = readFileSync(new URL('../frontend/src/routes/(apps)/admin/media.' + child + '.tsx', import.meta.url), 'utf8');
    assert.match(source, /component: MediaLibraryPage/);
  }
});
