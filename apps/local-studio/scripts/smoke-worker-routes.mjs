#!/usr/bin/env node
/**
 * Exercise the compiled Cloudflare Worker through real HTTP before deploying.
 * This catches runtime route errors that TypeScript, Vite and Wrangler dry-run
 * cannot catch, including unresolved symbols in backend/worker/index.js.
 *
 * Uses isolated local Wrangler bindings: no production D1/R2 writes or remote
 * secret access. The Hyperdrive URL is deliberately a non-connected local stub.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const workerBin = resolve(root, 'node_modules/.bin/wrangler');
const port = await new Promise((ok, fail) => {
  const server = createServer();
  server.once('error', fail);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const selectedPort = typeof address === 'object' && address ? address.port : null;
    server.close(() => selectedPort ? ok(selectedPort) : fail(new Error('no_ephemeral_port')));
  });
});
const base = `http://127.0.0.1:${port}`;
let logs = '';
const child = spawn(workerBin, [
  'dev', '-c', 'backend/wrangler.jsonc', '--local', '--ip', '127.0.0.1',
  '--port', String(port), '--inspector-port', '0',
], {
  cwd: root,
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
      process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ||
      'postgres://localhost:localhost@127.0.0.1:5432/studio_smoke_unconnected',
  },
});
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => { logs = (logs + String(chunk)).slice(-14000); });
}
function shutdown() {
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
    else child.kill('SIGTERM');
  } catch { /* already stopped */ }
}
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
const request = async (pathname) => fetch(base + pathname, {
  redirect: 'manual',
  signal: AbortSignal.timeout(5000),
});
try {
  let ready = false;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('local_worker_exited_early');
    try {
      const response = await request('/health');
      if (response.status === 200) { ready = true; break; }
    } catch { /* starting */ }
    await pause(500);
  }
  if (!ready) throw new Error('local_worker_not_ready');
  // Every anonymous /admin document AND /admin script is identity-gated.
  // A redirect is the expected success case; serving HTML or JS anonymously
  // would expose the admin boundary and must fail the deployment smoke test.
  const protectedAdminRoutes = [
    '/admin', '/admin/', '/admin/cad', '/admin/agentsam',
    '/admin/products', '/admin/products?view=collections',
    '/admin/products?view=platform', '/admin/products/create',
    '/admin/inventory', '/admin/orders', '/admin/discounts',
    '/admin/content', '/admin/content?kind=image', '/admin/content?kind=video',
    '/admin/moviemode', '/admin/moviemode/edit',
    '/admin/moviemode/edit?project=smoke',
    '/admin/store', '/admin/pages', '/admin/theme-editor?slug=home',
    '/admin/preferences', '/admin/subscribers', '/admin/products.html',
    '/admin/theme-project-editor?site_id=site-a&project=theme_plain-jane',
    '/admin/theme-code-editor?site_id=site-a&project=theme_plain-jane',
    '/admin/js/theme-project-editor-bootstrap.mjs',
    '/admin/js/agentsam-nav.js', '/admin/host-config.js',
  ];
  for (const pathname of protectedAdminRoutes) {
    const response = await request(pathname);
    const destination = response.headers.get('location');
    const target = destination ? new URL(destination, base) : null;
    if (response.status !== 302 || target?.pathname !== '/auth/login' ||
        target.searchParams.get('next') !== pathname ||
        response.headers.get('cache-control') !== 'private, no-store') {
      throw new Error(pathname + ' must require verified Identity before returning the shell or assets; got ' +
        response.status + ' -> ' + (destination || 'none'));
    }
    console.log('PASS ' + pathname + ': anonymous -> identity login');
  }
  // Site-free development does not make a private application public.
  for (const pathname of ['/sites?showcase=resolve','/media','/media/images','/media/videos']) {
    const response = await request(pathname);
    const destination = response.headers.get('location');
    const target = destination ? new URL(destination,base) : null;
    if (response.status !== 302 || target?.pathname !== '/auth/login' ||
        target.searchParams.get('next') !== pathname) {
      throw new Error(pathname + ' must redirect anonymous visitors to login, got ' + response.status);
    }
    console.log('PASS ' + pathname + ': anonymous -> identity login');
  }
  // The editor modules remain deployed, but admin entry modules are not
  // allowed to be fetched until a verified account session exists.
  for (const pathname of [
    '/theme-editor/project.mjs', '/theme-editor/bridge.mjs', '/theme-editor/mount.mjs',
    '/theme-editor/starter-project.mjs', '/theme-editor/starter-products.mjs',
    '/theme-editor/starter-chrome.mjs', '/theme-editor/system-template-registry.mjs',
  ]) {
    const response = await request(pathname);
    const type = response.headers.get('content-type') || '';
    if (response.status !== 200 || !/javascript/.test(type))
      throw new Error(`${pathname} expected public executable editor runtime, got ${response.status}: ${type}`);
    console.log(`PASS ${pathname}: installed editor runtime`);
  }
  // Protected Completeful routes must reach the JSON API, never fall through
  // to a static HTML page or an unhandled Worker exception.
  for (const pathname of [
    '/api/admin/completeful/status',
    '/api/admin/completeful/catalog?category=apparel',
    '/api/settings/companions',
    '/api/apps/launcher',
    '/api/browser/history',
    '/api/settings/browser',
    '/api/work/canvases',
    '/api/work/canvases/canvas_aaaaaaaaaaaa',
    '/api/work/canvases/canvas_aaaaaaaaaaaa/directions',
    '/api/work/canvases/canvas_aaaaaaaaaaaa/runs',
    '/api/work/canvases/canvas_aaaaaaaaaaaa/events?after=0',
    '/api/work/canvases/canvas_aaaaaaaaaaaa/runs/run_aaaaaaaaaaaa',
    '/api/work/canvases/canvas_aaaaaaaaaaaa/runs/run_aaaaaaaaaaaa/execute',
    '/api/work/canvases/canvas_aaaaaaaaaaaa/runs/run_aaaaaaaaaaaa/cancel',
    '/api/work/canvases/canvas_aaaaaaaaaaaa/cms/validate',
    '/api/work/canvases/canvas_aaaaaaaaaaaa/cms/convert',
  ]) {
    const response = await request(pathname);
    const contentType = response.headers.get('content-type') || '';
    if (response.status !== 401 || !contentType.includes('application/json')) {
      throw new Error(`${pathname} expected protected JSON 401, got ${response.status}: ${contentType}`);
    }
    console.log(`PASS ${pathname}: authenticated JSON route`);
  }
  // No anonymous account can install a native app through the shared Apps picker.
  const installProbe = await fetch(base + '/api/apps/install', {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({key:'agentsam-app-samsketch'}), redirect:'manual',
    signal:AbortSignal.timeout(5000),
  });
  if (installProbe.status !== 401 || !(installProbe.headers.get('content-type')||'').includes('application/json'))
    throw new Error('/api/apps/install expected authenticated JSON 401, got ' + installProbe.status);
  console.log('PASS /api/apps/install: unauthenticated installation rejected');
  // An anonymous request must not fetch the Apps picker implementation.
  // Packaged artifact presence is checked by the build pipeline; its network
  // access is protected by the /admin boundary above.
  // The platform must never serve the embedded customer's legacy login
  // or send AgentSam credentials to /api/admin/login.
  for (const legacyLogin of [
    '/admin/login',
    '/admin/login.html',
    '/ecommerce-cms-agentsam/admin/login',
  ]) {
    const result = await request(legacyLogin);
    const target = result.headers.get('location');
    if (result.status !== 302 || new URL(target, base).pathname !== '/auth/login') {
      throw new Error(`legacy login ${legacyLogin} did not resolve to /auth/login: ${result.status} ${target}`);
    }
    console.log(`PASS ${legacyLogin}: redirected to canonical identity login`);
  }
  const icon = await request('/shared/app-icon.png');
  const iconRedirect = icon.status === 302 &&
    new URL(icon.headers.get('location'), base).pathname === '/brand/agentsam-local-studio-icon.png';
  const iconAsset = icon.status === 200 && (icon.headers.get('content-type') || '').includes('image/png');
  if (!iconRedirect && !iconAsset) {
    throw new Error(`AgentSam login icon is unavailable: ${icon.status} ${icon.headers.get('content-type')}`);
  }
  console.log('PASS AgentSam login icon: valid hosted brand asset');
} catch (error) {
  console.error('WORKER ROUTE SMOKE FAILED:', error.message);
  console.error(logs.slice(-5500));
  process.exitCode = 1;
} finally {
  shutdown();
}
