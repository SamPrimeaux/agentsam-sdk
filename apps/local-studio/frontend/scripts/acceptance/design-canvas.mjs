import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const frontendRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const root = resolve(frontendRoot, '../../..');
const previewScript = resolve(root, 'apps/design-canvas/bin/agentsam-design-canvas.mjs');

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolveListen));
  const port = server.address().port;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function waitForPreview(url, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error('Design Canvas preview exited with ' + child.exitCode);
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error('Design Canvas preview did not start at ' + url);
}

const port = await freePort();
const url = 'http://127.0.0.1:' + port + '/';
execFileSync(process.execPath, [resolve(root, 'packages/agentsam-workbench/scripts/build.mjs')], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [resolve(root, 'apps/design-canvas/scripts/build.mjs')], { cwd: root, stdio: 'inherit' });
const preview = spawn(process.execPath, [previewScript, 'preview', String(port)], { cwd: root, stdio: 'ignore' });
let browser;
try {
  await waitForPreview(url, preview);
  const launchOptions = { headless: true, args: ['--no-sandbox'] };
  if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Slides', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Share document' }).count(), 0, 'unwired sharing must not appear as a dead control');

  const layoutTrigger = page.getByRole('button', { name: 'Add slide layout' }).first();
  await layoutTrigger.click();
  const layoutItems = await page.getByRole('menuitem').allTextContents();
  for (const layout of ['Blank', 'Title', 'Section', 'Title + body', 'Bullets', 'Two columns', 'Summary']) {
    assert.ok(layoutItems.some((item) => item.startsWith(layout)), 'missing slide layout: ' + layout);
  }
  await page.getByRole('menuitem').filter({ hasText: /^Title/ }).first().click();
  assert.equal(await page.locator('.dcx-slide-thumb').count(), 2, 'Title layout should add a slide');
  assert.equal(await page.locator('.dcx-object').count(), 3, 'Title layout should create editable title/subtitle objects');

  const insertToolbar = page.getByRole('toolbar', { name: 'Slide insert tools' });
  for (const control of ['Select', 'Hand', 'Text', 'Image', 'Media', 'Table', 'Comment']) {
    assert.equal(await insertToolbar.getByRole('button', { name: control, exact: true }).count(), 1, 'missing insert control: ' + control);
  }
  assert.equal(await insertToolbar.getByRole('button', { name: 'Insert shape' }).count(), 1, 'missing shape menu');
  assert.equal(await insertToolbar.getByRole('button', { name: 'Insert chart' }).count(), 1, 'missing chart menu');
  await insertToolbar.getByRole('button', { name: 'Text', exact: true }).click();
  await page.waitForTimeout(180);
  assert.equal(await page.locator('.dcx-selection-formatting-toolbar').count(), 1, 'selecting new text should show contextual formatting');
  await page.getByRole('button', { name: 'More formatting options' }).click();
  assert.equal(await page.locator('.dw-inspector').count(), 1, 'More formatting options should open the inspector');
  await page.getByRole('button', { name: 'Font family' }).click();
  const menu = page.locator('.dcx-menu-popover').last();
  const menuBox = await menu.boundingBox();
  const selectedBox = await page.locator('.dcx-object.is-selected').boundingBox();
  assert.ok(menuBox && selectedBox, 'font menu and selected object should be measurable');
  const overlaps = !(menuBox.x + menuBox.width <= selectedBox.x || menuBox.x >= selectedBox.x + selectedBox.width || menuBox.y + menuBox.height <= selectedBox.y || menuBox.y >= selectedBox.y + selectedBox.height);
  assert.equal(overlaps, false, 'contextual menus must not cover selected content');
  await page.keyboard.press('Escape');

  await insertToolbar.getByRole('button', { name: 'Insert chart' }).click();
  const chartItems = await page.getByRole('menuitem').allTextContents();
  for (const chart of ['Bar chart', 'Line chart', 'Pie chart', 'Area chart', 'Scatter plot', 'Histogram', 'Waterfall chart', 'Funnel chart', 'Treemap']) {
    assert.ok(chartItems.some((item) => item.includes(chart)), 'missing chart type: ' + chart);
  }
  await page.keyboard.press('Escape');
  await insertToolbar.getByRole('button', { name: 'Insert shape' }).click();
  const shapeItems = await page.getByRole('menuitem').allTextContents();
  for (const shape of ['Rectangle', 'Ellipse', 'Diamond', 'Triangle', 'Star', 'Arrow', 'Plus', 'Chevron', 'Callout', 'Line']) {
    assert.ok(shapeItems.includes(shape), 'missing shape type: ' + shape);
  }
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'View options' }).click();
  const viewItems = await page.getByRole('menuitem').allTextContents();
  for (const item of ['Show grid', 'Snap to grid', 'Show alignment guides', 'Show safe area']) assert.ok(viewItems.includes(item), 'missing view control: ' + item);
  await page.keyboard.press('Escape');

  const before = await page.locator('.dcx-thumb-label').allTextContents();
  await page.locator('.dcx-slide-thumb').nth(0).dragTo(page.locator('.dcx-slide-thumb').nth(1));
  const after = await page.locator('.dcx-thumb-label').allTextContents();
  assert.deepEqual(after, [before[1], before[0]], 'dragging thumbnails should reorder slides');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const mobile = await page.evaluate(() => ({ width: window.innerWidth, documentWidth: document.documentElement.scrollWidth, toolbar: document.querySelector('.dcx-slide-insert-toolbar')?.getBoundingClientRect().toJSON() }));
  assert.equal(mobile.documentWidth, mobile.width, 'mobile Slides must not create horizontal page overflow');
  assert.ok(mobile.toolbar && mobile.toolbar.left >= 0 && mobile.toolbar.right <= mobile.width, 'mobile insert toolbar must remain within the viewport');
  assert.deepEqual(pageErrors, [], 'Slides should not throw browser runtime errors');
  console.log('Design Canvas browser acceptance passed: layouts, insert tools, contextual inspector, collision avoidance, charts, shapes, view controls, slide reordering, 390×844 mobile.');
} finally {
  if (browser) await browser.close();
  preview.kill('SIGTERM');
}
