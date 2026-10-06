/** Isolated visual/interaction contract for the *actual packaged* merchant Store. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, '../ecommerce-cms-agentsam/frontend/store/mount.mjs');
const assets = resolve(root, '.output/public/commerce-store');
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>Commerce Store Smoke</title><body style="margin:0"></body>');
  const file = pathname === '/mount.mjs' ? source :
    pathname.startsWith('/commerce-store/') ? resolve(assets, pathname.slice('/commerce-store/'.length)) : null;
  if (!file || !file.startsWith(pathname === '/mount.mjs' ? source : assets + '/') || !existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const baseUrl = 'http://127.0.0.1:' + server.address().port;
const executablePath = process.env.CHROME_BIN || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (cause) => errors.push(String(cause)));
try {
  await page.goto(baseUrl);
  await page.evaluate(async () => {
    const { mountOnlineStore } = await import('/mount.mjs');
    const frame = document.createElement('iframe');
    frame.id = 'merchant-frame';
    frame.style.cssText = 'display:block;border:0;width:100vw;height:100vh';
    document.body.append(frame);
    frame.addEventListener('load', () => {
      window.__mounted = mountOnlineStore(frame, {
        baseUrl: location.origin,
        storefrontUrl: null,
        async loadStore() {
          return { store: { visibility: 'unknown' }, performance: {},
            active_theme: { name: 'Theme details unavailable', verified: false,
              preview_href: null, edit_href: '/admin/theme-editor?slug=home' },
            draft_themes: [] };
        },
        onEdit(slug) { window.__edited = slug; },
      });
    }, { once: true });
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>';
    await new Promise((done, reject) => {
      const check = () => {
        if (window.__mounted) return Promise.resolve(window.__mounted).then(done, reject);
        setTimeout(check, 25);
      };
      check();
    });
  });
  const merchant = page.frameLocator('#merchant-frame');
  await merchant.locator('.online-store').waitFor();
  assert.equal(await merchant.locator('.online-store-title h1').innerText(), 'Online Store');
  assert.equal(await merchant.locator('#store-visibility-label').innerText(), 'Unverified');
  assert.equal(await merchant.locator('.online-store-badge--active').innerText(), 'Theme unverified');
  assert.equal(await merchant.locator('.online-store-preview-message').count(), 2, 'No unrelated host homepage rendered as a storefront');
  assert.equal(await merchant.locator('#import-theme-btn').isDisabled(), true, 'Unimplemented import cannot be clicked');
  await merchant.locator('#edit-theme-btn').click();
  assert.equal(await page.evaluate(() => window.__edited), 'home', 'Edit launches the correct existing editor entry');
  await page.setViewportSize({ width: 390, height: 844 });
  const dimensions = await merchant.locator('.online-store').evaluate((node) => ({
    width: node.getBoundingClientRect().width,
    viewport: node.ownerDocument.defaultView.innerWidth,
  }));
  assert.ok(dimensions.width <= dimensions.viewport + 1, 'Online Store layout fits mobile viewport');
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log('Packaged Online Store smoke PASS: exact merchant DOM, adapter data, safe preview, edit action, mobile width');
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
