import test from 'node:test';
import assert from 'node:assert/strict';
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
  const app = readFileSync(new URL('../frontend/src/routes/__root.tsx', import.meta.url), 'utf8');
  assert.match(app, /<PackagedConsoleFrame><AgentSamShell embedded/);
  for (const file of [
    'frontend/public/admin/host-config.js',
    '.output/public/admin/js/shell.js',
    '.output/public/ecommerce-cms-agentsam/admin/home.html'
  ]) assert.ok(existsSync(new URL('../' + file, import.meta.url)), file);
});
