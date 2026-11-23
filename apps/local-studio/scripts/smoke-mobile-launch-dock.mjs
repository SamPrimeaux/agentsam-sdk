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
  const goalFixture = {
    goals: [
      { id: 'focus-life', source_key: null, title: 'Phone Focus QA', description: 'A focused goal description', goal_type: 'personal', status: 'active', priority: 1 },
      { id: 'focus-work', source_key: null, title: 'Platform Focus QA', description: 'A work goal description', goal_type: 'platform', status: 'active', priority: 1 },
    ],
    steps: [{ id: 'life-step', goal_id: 'focus-life', title: 'Review a concrete step', status: 'todo' }],
    ticketLinks: [],
    goapGoals: [{ id: 'goap-focus', title: 'Engineering Focus QA', status: 'active', goal_status: 'active', project: 'Studio', focused: true }],
  };
  await page.route('**/api/studio/living-plan*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(goalFixture),
  }));
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
  // AgentSam now uses the same packaged dock with contextual Work surfaces.
  const workDock = page.getByRole('navigation', { name: 'Work surfaces' });
  await workDock.waitFor({state:'visible'});
  await dock.waitFor({state:'hidden'});
  assert.deepEqual(await workDock.locator('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
    ['Chat', 'Files', 'Code', 'Terminal', 'Preview']);
  assert.equal(await page.locator('.as-nav-launch-dock:visible').count(), 1, 'never stack two bottom docks');
  const phoneDockBounds = await workDock.boundingBox();
  const phoneComposerBounds = await page.locator('.agentsam-conversation-dock').boundingBox();
  assert.ok(phoneDockBounds && phoneComposerBounds && phoneComposerBounds.y + phoneComposerBounds.height <= phoneDockBounds.y + 2,
    '390px composer must remain above the floating Work dock');
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
  const homeMetrics = await page.frameLocator('iframe[title="AgentSam admin home"]').locator('.fnf-home-stage').evaluate((stage) => {
    const root = document.documentElement;
    const rect = stage.getBoundingClientRect();
    return {width: root.clientWidth, scrollWidth: root.scrollWidth, left: rect.left, right: rect.right,
      theme: root.dataset.theme, background: getComputedStyle(document.querySelector('.fnf-home')).backgroundColor,
      previewWidth: document.querySelector('.fnf-site-preview')?.getBoundingClientRect().width};
  });
  assert.ok(homeMetrics.left >= -1 && homeMetrics.right <= homeMetrics.width + 1,
    `embedded Home must fit its frame: ${JSON.stringify(homeMetrics)}`);
  assert.ok(homeMetrics.scrollWidth <= homeMetrics.width + 1,
    `embedded Home must not overflow horizontally: ${JSON.stringify(homeMetrics)}`);
  assert.ok(homeMetrics.previewWidth <= homeMetrics.width,
    'Home website preview must flex with the available width');
  const hostTheme = await page.locator('.as-nav-scope').first().getAttribute('data-nav-theme');
  assert.equal(homeMetrics.theme, hostTheme, 'embedded Home follows the active account theme');
  if (hostTheme === 'dark') {
    assert.notEqual(homeMetrics.background, 'rgb(241, 241, 241)', 'embedded Home must not retain light surface in dark mode');
  }
  for (const width of [526, 820, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const fit = await page.frameLocator('iframe[title="AgentSam admin home"]').locator('.fnf-home-stage').evaluate(stage => {
      const rect = stage.getBoundingClientRect();
      return { width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
        left: rect.left, right: rect.right };
    });
    assert.ok(fit.left >= -1 && fit.right <= fit.width + 1 && fit.scroll <= fit.width + 1,
      `${width}px Home must fit in Side Stage-width containers: ${JSON.stringify(fit)}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await dock.getByRole('button', { name: 'Ideas' }).click();
  await page.locator('[data-studio-product="ideas"]').waitFor({ state: 'visible' });
  await dock.getByRole('button', { name: 'Goals' }).click();
  await page.waitForURL(/#\/admin\/goalguru/);
  await page.getByRole('button', { name: 'Life', exact: true }).click();
  await page.getByRole('button', { name: 'Open goal: Phone Focus QA' }).click();
  await page.getByRole('button', { name: 'All Life goals' }).waitFor({ state: 'visible' });
  await page.getByText('A focused goal description').waitFor({ state: 'visible' });
  await page.getByText('Review a concrete step').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'All Life goals' }).click();
  await page.getByRole('button', { name: 'Work', exact: true }).click();
  await page.getByRole('button', { name: 'Open goal: Engineering Focus QA' }).click();
  await page.getByRole('region', { name: 'Goal details: Engineering Focus QA' }).waitFor({ state: 'visible' });
  assert.ok(page.url().includes('/admin/goalguru'), 'focus must remain on Goals instead of navigating to Work');
  await page.getByRole('button', { name: 'All Work goals' }).click();
  await dock.getByRole('button', { name: 'Library' }).click();
  const library = page.locator('[data-studio-product="library"][data-library-view="artifacts"]');
  await library.waitFor({ state: 'visible' });
  assert.equal(await dock.isVisible(), false, 'Library does not reuse the global destination dock');
  const libraryDock = page.getByRole('navigation', { name: 'Library navigation' });
  await libraryDock.waitFor({state:'visible'});
  assert.deepEqual(await libraryDock.locator('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
    ['Artifacts', 'Yours', 'Shared', 'Recent', 'Media']);
  await libraryDock.getByRole('button', {name:'Yours'}).click();
  await page.waitForFunction(() => location.href.includes('view=yours'));
  assert.equal(await libraryDock.getByRole('button',{name:'Yours'}).getAttribute('aria-pressed'), 'true');
  await libraryDock.getByRole('button', {name:'Artifacts'}).click();
  await page.waitForFunction(() => !location.href.includes('view=yours'));
  assert.equal(await libraryDock.getByRole('button',{name:'Artifacts'}).getAttribute('aria-pressed'), 'true');
  await libraryDock.getByRole('button', { name: 'Media' }).click();
  await page.locator('[data-studio-product="library"][data-library-view="media"]').waitFor({ state: 'visible' });
  await page.locator('[data-agentsam-media-library]').waitFor({ state: 'visible' });
  // Tablet/half-browser acceptance: Work uses one centered dock and a single stage.
  await page.goto('http://127.0.0.1:' + server.address().port + '/#/admin/agentsam', {waitUntil:'domcontentloaded'});
  for (const width of [820, 1024]) {
    await page.setViewportSize({width, height: 900});
    await workDock.waitFor({state:'visible'});
    const bounds = await workDock.boundingBox();
    assert.ok(bounds && bounds.width <= 540 && bounds.x >= 0 && bounds.x + bounds.width <= width,
      `${width}px Work dock stays compact and inside the viewport`);
    assert.equal(await page.locator('.as-nav-launch-dock:visible').count(), 1);
    const composer = await page.locator('.agentsam-conversation-dock').boundingBox();
    assert.ok(composer && bounds && composer.y + composer.height <= bounds.y + 2,
      `${width}px composer must remain above the compact dock`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
      `${width}px app does not overflow horizontally`);
  }
  assert.deepEqual(errors, [], 'the mobile and tablet paths must not throw page errors');
  console.log('[mobile-launch-smoke] PASS 390x844, 820x900, 1024x900: shared packaged dock, one header drawer, scoped contexts, focused Library/Media');
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
