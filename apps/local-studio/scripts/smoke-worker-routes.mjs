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
  for (const [pathname, allowed] of [
    ['/admin/cad', [200, 302]],
    ['/admin/agentsam', [200, 302]],
    ['/admin/products', [200]],
  ]) {
    const response = await request(pathname);
    const payload = await response.text();
    const loginTarget = response.status === 302
      ? new URL(response.headers.get('location') || '/', base) : null;
    if (!allowed.includes(response.status) ||
        (response.status === 200 && !payload.toLowerCase().includes('<!doctype html')) ||
        (loginTarget && (loginTarget.pathname !== '/auth/login' ||
          loginTarget.searchParams.get('next') !== pathname))) {
      throw new Error(`${pathname} returned ${response.status}: ${payload.slice(0, 350)}`);
    }
    console.log(`PASS ${pathname}: ${response.status}`);
  }
  // Protected Completeful routes must reach the JSON API, never fall through
  // to a static HTML page or an unhandled Worker exception.
  for (const pathname of [
    '/api/admin/completeful/status',
    '/api/admin/completeful/catalog?category=apparel',
  ]) {
    const response = await request(pathname);
    const contentType = response.headers.get('content-type') || '';
    if (response.status !== 401 || !contentType.includes('application/json')) {
      throw new Error(`${pathname} expected protected JSON 401, got ${response.status}: ${contentType}`);
    }
    console.log(`PASS ${pathname}: authenticated JSON route`);
  }
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
