/**
 * Browser acceptance for the canonical website-management entry point.
 * /cms is an alias to Ecommerce CMS AgentSam's existing /admin/store route;
 * it must not render the retired CMS editor or select a content-only project.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const cwd = resolve(import.meta.dirname, '..');
const root = resolve(cwd, 'desktop-dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + pathname);
  if (!file.startsWith(root + '/') || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
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
  await page.addInitScript(() => Object.defineProperty(window, '__AGENTSAM_DESKTOP__', {
    configurable: false, get: () => false, set: () => {},
  }));

  const scriptErrors = [];
  page.on('pageerror', (error) => scriptErrors.push(String(error)));

  // The first registered site is content-only on purpose. The /cms alias must
  // discard that old CMS selection and let the canonical app resolve an actual
  // editable Ecommerce Worker without hardcoding a customer into the route.
  await page.route('**/api/cms/sites', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, sites: [
      { slug: 'agentsam-sdk', id: 'proj_agentsam_sdk', name: 'Agent Sam SDK',
        domain: 'inneranimalmedia.com', source: 'shared-d1', can_edit: true, can_publish: true },
      { slug: 'fuelnfreetime', id: 'proj_fuelnfreetime', name: 'Fuel & Free Time',
        domain: 'fuelnfreetime.com', source: 'worker', can_edit: true, can_publish: false },
    ] }),
  }));
  await page.route('https://fuelnfreetime.com/**', (route) => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><html><head><title>Store route smoke</title></head><body><main data-ecommerce-store-route>Canonical Ecommerce Online Store route</main></body></html>',
  }));

  await page.goto(base + '/index.html#/cms', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForURL(/apps\/ecommerce-cms-agentsam/, { timeout: 18000 });
  const host = page.locator('[data-agentsam-installed-app="ecommerce-cms-agentsam"]');
  await host.waitFor({ timeout: 18000 });

  const iframe = page.locator('iframe[title="Ecommerce CMS — complete admin application"]');
  await iframe.waitFor({ timeout: 12000 });
  assert.equal(await iframe.getAttribute('src'), 'https://fuelnfreetime.com/admin/store',
    '/cms must open the canonical Ecommerce /admin/store experience');

  const storeFrame = page.frame({ url: /fuelnfreetime\.com\/admin\/store/ });
  assert.ok(storeFrame, 'the canonical Ecommerce store iframe must be mounted');
  await storeFrame.locator('[data-ecommerce-store-route]').waitFor({ timeout: 12000 });
  assert.match(await storeFrame.locator('main').innerText(), /Canonical Ecommerce Online Store route/);

  assert.equal(await page.locator('#cms-site-select').count(), 0,
    'the old Local Studio CMS site/editor surface must not render');
  assert.equal(await page.locator('[data-cms-site-installation="unlinked"]').count(), 0,
    'the content-only CMS fallback must not render');
  assert.deepEqual(scriptErrors, []);
  console.log('CMS route smoke PASS: /cms delegates to Ecommerce CMS AgentSam /admin/store');
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
