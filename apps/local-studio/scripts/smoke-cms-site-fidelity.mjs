/**
 * Local Studio Desktop Ecommerce CMS acceptance.
 * The installed product is packaged in this repository; no customer domain,
 * credentials, or production site is required to inspect its actual route files.
 * The real sign-in and CMS mutations are deliberately not mocked as success.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const studio = resolve(import.meta.dirname, '..');
const root = resolve(studio, 'desktop-dist');
const required = [
  'admin/store.html',
  'admin/pages.html',
  'admin/page-edit.html',
  'admin/theme-editor.html',
  'admin/js/pages-shared.js',
  'admin/js/theme-editor.js',
  'admin/js/theme-embed-review.js',
  'admin/js/cms-authoring-engine.js',
  'admin/host-config.js',
];
for (const name of required) {
  const file = resolve(root, name);
  assert.ok(file.startsWith(root + '/') && existsSync(file) && statSync(file).size > 0, 'missing installed CMS asset: ' + name);
}
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png',
  '.webp': 'image/webp',
};
const spaRoutes = new Set(['/', '/chats', '/agentsam', '/projects', '/artifacts', '/files', '/ship']);
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const relative = spaRoutes.has(pathname) ? 'index.html' : pathname.slice(1);
  const file = resolve(root, relative);
  if (!file.startsWith(root + '/') || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.setHeader('content-type', mime[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN ||
      (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // The preview mode bypasses only the sign-in presentation for localhost;
  // CMS API calls remain real and require a configured account/Worker.
  await page.goto(base + '/index.html#/apps/ecommerce-cms-agentsam?page=%2Fadmin%2Fstore&preview=local', {
    waitUntil: 'domcontentloaded', timeout: 20000,
  });
  const host = page.locator('[data-agentsam-installed-app="ecommerce-cms-agentsam"]');
  await host.waitFor({ timeout: 16000 });
  const iframe = host.locator('iframe[title="Ecommerce CMS — complete admin application"]');
  await iframe.waitFor({ timeout: 12000 });
  const source = new URL(await iframe.getAttribute('src'), base);
  assert.equal(source.origin, base, 'Ecommerce product must load from Local Studio, not a merchant Worker');
  assert.equal(source.pathname, '/ecommerce-cms-agentsam/admin/store.html');
  for (const route of ['store', 'pages', 'page-edit?slug=about', 'theme-editor?slug=shop']) {
    const asset = new URL('/ecommerce-cms-agentsam/admin/' + route.replace('?', '.html?') + (route.includes('?') ? '' : '.html'), base);
    const response = await page.request.get(asset.toString());
    assert.equal(response.status(), 200, 'packaged route failed: ' + asset.pathname);
    assert.ok((response.headers()['content-type'] || '').includes('text/html'));
  }
  assert.equal(await page.locator('#cms-site-select').count(), 0, 'retired editor appeared');
  console.log('CMS installed app smoke PASS: local Store, Pages, Page Editor, Theme Editor');
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
