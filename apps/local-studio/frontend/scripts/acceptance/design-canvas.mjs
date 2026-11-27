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

  await insertToolbar.getByRole('button', { name: 'SVG', exact: true }).click();
  const svgObject = page.locator('.dcx-object-svg').first();
  await svgObject.waitFor();
  const svgEditor = page.getByLabel('Inline SVG markup');
  const svgSource = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10h80v80H10z" fill="#276749"/></svg>';
  await svgEditor.fill(svgSource);
  await page.getByRole('button', { name: 'Apply source' }).click();
  assert.equal(await svgObject.locator('.dcx-object-svg-content svg path').count(), 1, 'inline SVG source should render as vector artwork');

  await svgEditor.fill('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  await page.getByRole('button', { name: 'Apply source' }).click();
  assert.equal(await page.getByRole('alert').filter({ hasText: 'svg_embedded_content_unsupported' }).count(), 1, 'unsafe inline SVG should be rejected');

  await page.locator('input[accept=".svg,image/svg+xml"]').setInputFiles({
    name: 'brand-mark.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" fill="#276749"/></svg>'),
  });
  await page.waitForFunction(() => document.querySelector('.dcx-object-svg-content svg circle') !== null);
  assert.equal(await svgObject.locator('.dcx-object-svg-content svg circle').count(), 1, 'uploaded SVG should replace the selected vector source');

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
  // Fresh phone navigation, not merely a resized desktop editor.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  phone.on('pageerror', (error) => pageErrors.push(error.message));
  await phone.goto(url, { waitUntil: 'networkidle' });
  await phone.getByRole('button', { name: 'Slides', exact: true }).click();
  await phone.getByRole('region', { name: 'Presentation overview' }).waitFor();
  assert.equal(await phone.locator('.dcx-slide-overview-card').count(), 1);
  assert.equal(await phone.locator('.dcx-slide-insert-toolbar').count(), 0, 'overview must not mount edit chrome');
  const card = await phone.locator('.dcx-slide-overview-card').boundingBox();
  assert.ok(card && card.x >= 0 && card.x + card.width <= 390, 'slide preview fits phone');
  await phone.getByRole('button', { name: 'Presentation options' }).click();
  await phone.getByRole('menuitem').filter({ hasText: 'Full-screen slide show' }).first().click();
  await phone.locator('.dcx-present-mode').waitFor();
  await phone.getByRole('button', { name: 'Exit' }).click();
  await phone.getByRole('button', { name: 'Edit', exact: true }).click();
  const phoneTools = phone.getByRole('toolbar', { name: 'Slide insert tools' });
  await phoneTools.waitFor();
  await phoneTools.getByRole('button', { name: 'Comment', exact: true }).click();
  await phone.locator('[data-contextual-inspector="true"][data-mobile-pane="inspector"]').waitFor();
  const commentInput = phone.getByRole('textbox', { name: 'Add a comment' });
  await commentInput.fill('Mobile comment acceptance');
  await phone.getByRole('button', { name: 'Add comment', exact: true }).click();
  await phone.getByText('Mobile comment acceptance', { exact: true }).waitFor();
  assert.equal(await commentInput.inputValue(), '');
  await phone.getByRole('button', { name: 'Close comments', exact: true }).click();
  await phone.locator('[data-mobile-pane="stage"]').waitFor();
  await phone.close();
  assert.deepEqual(pageErrors, [], 'Slides should not throw browser runtime errors');
  console.log('Design Canvas browser acceptance passed: layouts, insert tools, inline SVG import/edit/sanitization, contextual inspector, collision avoidance, charts, shapes, view controls, slide reordering, 390×844 mobile.');
} finally {
  if (browser) await browser.close();
  preview.kill('SIGTERM');
}
