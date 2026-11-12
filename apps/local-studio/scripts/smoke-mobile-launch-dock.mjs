#!/usr/bin/env node
/** Headless 390px smoke of the REAL packaged Console + AgentSam app. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../desktop-dist');
if (!existsSync(join(root, 'index.html'))) throw new Error('Build Local Studio desktop-dist before running the mobile smoke.');
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
  const file = pathname === '/' ? join(root, 'index.html') : resolve(root, '.' + pathname);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end('missing');
    return;
  }
  response.setHeader('content-type', mime[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(response);
});

await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true,
  });
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('http://127.0.0.1:' + server.address().port + '/#/admin/agentsam', {
    waitUntil: 'domcontentloaded',
  });
  const dock = page.getByRole('navigation', { name: 'Quick navigation' });
  await dock.waitFor({ state: 'visible' });
  assert.deepEqual(await dock.locator('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
    ['Chats', 'Home', 'Ideas', 'Goals', 'Library']);
  assert.equal(await page.locator('.console-sidenav.admin-sidebar').evaluate((element) => getComputedStyle(element).display), 'none');
  await dock.getByRole('button', { name: 'Chats' }).click();
  const drawer = page.getByRole('dialog', { name: 'Navigation' });
  assert.equal(await drawer.isVisible(), true);
  assert.equal(await page.locator('.as-nav-mobile-drawer').count(), 1);
  assert.equal(await drawer.getByRole('textbox', { name: 'Filter projects and conversations' }).count(), 0,
    'search stays concealed until requested');
  await drawer.getByRole('button', { name: 'Search projects and conversations' }).click();
  assert.equal(await drawer.getByRole('textbox', { name: 'Filter projects and conversations' }).count(), 1);
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).pointerEvents), 'auto',
    'closing Chats must restore touch interaction');
  await dock.getByRole('button', { name: 'Home' }).click();
  assert.equal(await page.evaluate(() => location.hash.split('?')[0]), '#/admin/home');
  await page.getByTitle('AgentSam admin home').waitFor({ state: 'visible' });
  await page.frameLocator('iframe[title="AgentSam admin home"]')
    .locator('#fnf-home-heading').waitFor({ state: 'visible' });
  assert.equal(await page.frameLocator('iframe[title="AgentSam admin home"]')
    .locator('.console-topbar').evaluate((element) => getComputedStyle(element).display),
    'none', 'Home must not render a second global toolbar');
  await page.locator('.console-topbar-center .agentsam-mobile-companion-identity [data-companion-id]')
    .waitFor({ state: 'visible' });
  assert.equal(await dock.isVisible(), true, 'Home must retain the app launch dock');
  await dock.getByRole('button', { name: 'Ideas' }).click();
  await page.locator('[data-studio-product="ideas"]').waitFor({ state: 'visible' });
  await dock.getByRole('button', { name: 'Goals' }).click();
  await page.waitForURL(/#\/goalguru/);
  await dock.getByRole('button', { name: 'Library' }).click();
  await page.getByRole('tablist', { name: 'Library content' }).waitFor({ state: 'visible' });
  await page.getByRole('tab', { name: 'Media', exact: true }).click();
  await page.locator('[data-agentsam-media-library]').waitFor({ state: 'visible' });
  assert.deepEqual(errors, [], 'the mobile path must not throw page errors');
  console.log('[mobile-launch-smoke] PASS 390x844: five destinations, one Chats drawer, Home route, Ideas, Goals, Library/Media');
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
