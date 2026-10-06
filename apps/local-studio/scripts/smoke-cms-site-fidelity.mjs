/**
 * Browser acceptance for real site/theme authority. Mocks IAM-authenticated
 * registry responses, never actual user content or credentials.
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
  // Exercise the common browser transport in a built SPA. The desktop
  // distribution injects an unconditional desktop marker for Tauri; this
  // browser harness has no Tauri bridge and supplies mocked IAM responses.
  await page.addInitScript(() => Object.defineProperty(window, '__AGENTSAM_DESKTOP__', {
    configurable: false, get: () => false, set: () => {},
  }));

  const scriptErrors = [];
  page.on('pageerror', (error) => scriptErrors.push(String(error)));
  await page.route('**/api/cms/sites', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, sites: [
      { slug: 'agentsam-sdk', id: 'proj_agentsam_sdk', name: 'Agent Sam SDK',
        domain: 'inneranimalmedia.com', source: 'shared-d1', can_edit: true, can_publish: true },
      { slug: 'fuelnfreetime', id: 'proj_fuelnfreetime', name: 'Fuel & Free Time',
        domain: 'fuelnfreetime.com', source: 'worker', can_edit: true, can_publish: false },
    ] }),
  }));
  const overview = {
    ok: true, store: { visibility: 'public', url: 'https://fuelnfreetime.com/' },
    active_theme: {
      id: 'heuristic', name: 'Heuristic', verified: true,
      edit_href: '/admin/theme-editor?slug=shop',
      appearance: { theme_id: 'heuristic-commerce', tokens: {
        color: { canvas: '#090909', surface: '#141414', surfaceRaised: '#1b1b1b',
          ink: '#f7f5f0', muted: '#aaa8a2', accent: '#ff4d00' },
      } },
    }, performance: {}, draft_themes: [],
  };
  await page.route('**/api/cms/remote/**', (route) => {
    const url = new URL(route.request().url());
    const tail = url.pathname.split('/api/cms/remote/')[1];
    if (tail === 'store/online') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(overview) });
    if (tail === 'pages') return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, pages: [{ slug: 'shop', title: 'Shop', live_route: '/shop', status: 'draft' }] }) });
    if (tail === 'pages/shop') return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, page: { slug: 'shop', title: 'Shop', live_route: '/shop',
        status: 'draft', sections: [{ key: 'hero', content: { headline: 'FNF headline' }, version: 1, status: 'draft' }] } }) });
    if (tail === 'registry') return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, fieldTypes: {}, pages: { shop: { sections: {} } } }) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'test_route_not_available' }) });
  });
  await page.route('https://fuelnfreetime.com/**', (route) => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><html><body><main>Verified Fuel & Free Time storefront page</main></body></html>',
  }));

  await page.goto(base + '/index.html#/cms', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.locator('[data-studio-product="commerce-online-store"]').waitFor({ timeout: 18000 });
  assert.equal(await page.locator('#cms-site-select').inputValue(), 'fuelnfreetime',
    'Real installed Worker is preferred over a legacy project on /cms');
  const store = page.frameLocator('iframe[title*="Online Store"]');
  await store.locator('#active-theme-name').getByText('Heuristic').waitFor({ timeout: 14000 });
  const palette = await store.locator('.online-store-title').evaluate((el) => ({
    title: getComputedStyle(el).color,
    canvas: getComputedStyle(el.ownerDocument.body).backgroundColor,
  }));
  assert.equal(palette.title, 'rgb(247, 245, 240)', 'Active-theme ink remains readable on dark canvas');
  assert.equal(palette.canvas, 'rgb(9, 9, 9)', 'Active Heuristic canvas replaces hardcoded white');
  assert.equal(await store.locator('html').evaluate((root) => root.dataset.cmsThemeId), 'heuristic-commerce',
    'Store consumes installed active-theme manifest');
  assert.equal(new URL(await store.locator('#theme-preview-desktop').getAttribute('src')).origin,
    'https://fuelnfreetime.com');
  assert.equal(await store.locator('.online-store-theme-actions #edit-theme-btn').count(), 1);
  await store.locator('#edit-theme-btn').click();
  await page.waitForURL(/view=editor/, { timeout: 12000 });
  const editor = page.frameLocator('iframe[title="Theme Editor"]');
  await editor.locator('#theme-preview').waitFor({ timeout: 12000 });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('iframe')].some(frame =>
      frame.contentDocument?.querySelector('#te-preview-label')?.textContent?.includes('Published storefront')
    ), { timeout: 12000 });

  assert.match(await editor.locator('#te-preview-label').innerText(), /Published storefront/);
  assert.equal(await editor.locator('#theme-preview').getAttribute('src'), 'https://fuelnfreetime.com/shop');
  assert.match(await editor.locator('.te-preview-mode').innerText(), /edits are saved as drafts/);
  await page.goto(base + '/index.html#/cms');
  await page.locator('#cms-site-select').waitFor();
  await page.locator('#cms-site-select').selectOption('agentsam-sdk');
  await page.locator('[data-cms-site-installation="unlinked"]').waitFor();
  assert.equal(await page.locator('[data-studio-product="commerce-online-store"]').count(), 0,
    'Content-only project never impersonates a storefront');
  assert.match(await page.locator('[data-cms-site-installation="unlinked"]').innerText(), /no verified storefront renderer/i);
  assert.deepEqual(scriptErrors, []);
  console.log('CMS site/theme fidelity PASS: installed Worker default, Heuristic manifest, verified storefront, unlinked project guarded');
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
