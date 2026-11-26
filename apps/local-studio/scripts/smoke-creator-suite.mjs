import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const studio = resolve(import.meta.dirname, '..');
const root = resolve(studio, 'desktop-dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + name);
  if (!file.startsWith(root + '/') || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('content-type', mime[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
const jsErrors = [];
page.on('pageerror', (error) => jsErrors.push(error.message));
async function visit(url, selector) {
  await page.goto(origin + '/index.html#' + url);
  await page.locator(selector).waitFor({ state: 'visible', timeout: 15000 });
}
// This static smoke has no account/provider session; it verifies fail-closed surfaces instead of fabricating writes.
try {
  await page.goto(origin + '/index.html#/admin/store');
  await page.getByText('Sign in required', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('Create or choose a store', { exact: true }).waitFor({ timeout: 15000 });

  await visit('/admin/themes', '[data-theme-store-handoff]');
  const themeStoreLink = page.getByRole('link', { name: 'Open Theme Store', exact: true });
  await themeStoreLink.waitFor({ state: 'visible' });
  assert.equal(await themeStoreLink.getAttribute('href'), 'https://themes.inneranimalmedia.com/');

  await visit('/admin/media', '[data-studio-product="library"][data-library-view="media"]');
  await page.getByRole('heading', { name: 'Library', exact: true }).waitFor({ state: 'visible' });
  await page.getByText('Couldn’t load media', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('Open storage settings', { exact: true }).waitFor({ timeout: 15000 });
  assert.equal(jsErrors.length, 0, 'no uncaught client exceptions');
} catch (error) {
  const state = await page.evaluate(() => ({ url: location.href, heading: document.body.innerText.slice(0, 850) })).catch(() => null);
  console.error('[creator-suite] Failure state:', state, jsErrors);
  throw error;
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
console.log('[creator-suite] PASS Online Store auth gate, Theme Store handoff and Media authorization failure state');
