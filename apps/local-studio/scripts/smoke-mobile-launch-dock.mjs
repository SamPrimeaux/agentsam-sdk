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
  await page.goto('http://127.0.0.1:' + server.address().port + '/#/admin/home', {
    waitUntil: 'domcontentloaded',
  });
  const dock = page.getByRole('navigation', { name: 'Quick navigation' });
  await dock.waitFor({ state: 'visible' });
  // The nav shell may appear before React has hydrated its destinations.
  // Wait for the real interactive control, not just an empty nav container.
  await dock.getByRole('button', { name: 'Chats' }).waitFor({ state: 'visible' });
  assert.deepEqual(await dock.locator('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
    ['Chats', 'Home', 'Ideas', 'Goals', 'Library']);
  // The host remains mounted at zero width so the shared fixed push drawer
  // can appear; the legacy rail itself must not occupy mobile canvas space.
  assert.equal(await page.locator('.console-sidenav.admin-sidebar').evaluate((element) =>
    element.getBoundingClientRect().width), 0);
  await dock.getByRole('button', { name: 'Chats' }).click();
  // Chats is a focused conversation. Only the header bubble opens navigation.
  await dock.waitFor({state:'hidden'});
  const navToggle = page.locator('[data-shared-nav-toggle], .agentsam-topbar-leading [aria-label="Toggle global navigation"]').first();
  await navToggle.click();
  // Shared navigation is a push drawer (an inline aside), not a modal dialog.
  const drawer = page.locator('.as-nav-mobile-drawer');
  await drawer.locator('[aria-label="New chat"]').waitFor({ state: 'visible' });
  assert.equal(await drawer.getAttribute('data-open'), 'true');
  await page.waitForFunction(() => {
    const workspace = document.querySelector('.console-workspace');
    return workspace && getComputedStyle(workspace).transform !== 'none';
  });
  assert.equal(await page.locator('.as-nav-mobile-drawer').count(), 1);
  assert.equal(await drawer.getByRole('button', { name: 'New chat' }).count(), 1, 'New chat is the first navigation action');
  assert.equal(await drawer.getByRole('button', { name: 'Open Projects' }).count(), 1, 'one Projects collection has a real management route');
  assert.equal(await drawer.getByRole('textbox', { name: 'Filter projects and conversations' }).count(), 0,
    'search stays concealed until requested');
  await drawer.getByRole('button', { name: 'Search projects and conversations' }).click();
  assert.equal(await drawer.getByRole('textbox', { name: 'Filter projects and conversations' }).count(), 1);
  // Escape first dismisses the focused search field; the next Escape closes
  // the push drawer. Neither action may leave the workspace untouchable.
  await page.keyboard.press('Escape');
  await drawer.getByRole('textbox', { name: 'Filter projects and conversations' }).waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('.as-nav-mobile-drawer')?.getAttribute('data-open') === 'false');
  assert.equal(await drawer.getAttribute('aria-hidden'), 'true');
  assert.equal(await drawer.getAttribute('inert'), '');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).pointerEvents), 'auto',
    'closing Chats must restore touch interaction');
  await page.goto('http://127.0.0.1:' + server.address().port + '/#/admin/home', {waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(() => location.hash.split('?')[0]), '#/admin/home');
  await page.getByTitle('AgentSam admin home').waitFor({ state: 'visible' });
  await page.frameLocator('iframe[title="AgentSam admin home"]')
    .locator('#fnf-home-heading').waitFor({ state: 'visible' });
  assert.equal(await page.frameLocator('iframe[title="AgentSam admin home"]')
    .locator('.console-topbar').count(),
    0, 'Home must not render a second global toolbar');
  await page.locator('.console-topbar-center .agentsam-mobile-companion-identity [data-companion-id]')
    .waitFor({ state: 'visible' });
  assert.equal(await dock.isVisible(), true, 'Home must retain the app launch dock');
  await dock.getByRole('button', { name: 'Ideas' }).click();
  await page.locator('[data-studio-product="ideas"]').waitFor({ state: 'visible' });
  await dock.getByRole('button', { name: 'Goals' }).click();
  await page.waitForURL(/#\/admin\/goalguru/);
  await dock.getByRole('button', { name: 'Library' }).click();
  const library = page.locator('[data-studio-product="library"][data-library-view="artifacts"]');
  await library.waitFor({ state: 'visible' });
  assert.equal(await dock.isVisible(), false, 'Library is a focused destination without the launch dock');
  await library.getByRole('navigation', { name: 'Library sections' }).getByRole('button', { name: 'Media' }).click();
  await page.locator('[data-studio-product="library"][data-library-view="media"]').waitFor({ state: 'visible' });
  await page.locator('[data-agentsam-media-library]').waitFor({ state: 'visible' });
  assert.deepEqual(errors, [], 'the mobile path must not throw page errors');
  console.log('[mobile-launch-smoke] PASS 390x844: chat without dock, one header drawer, scoped Home/Ideas/Goals dock, focused Library/Media');
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
