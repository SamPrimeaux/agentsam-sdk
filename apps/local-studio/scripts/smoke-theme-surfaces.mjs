import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { discoverThemeSurfaces } from './theme-surfaces-plugin.mjs';
import { changedPixelRatio } from './compare-surface-png.mjs';

const studio = resolve(import.meta.dirname, '..');
const repo = resolve(studio, '../..');
const root = resolve(studio, 'desktop-dist');
const out = resolve(studio, 'artifacts/surface-parity/desktop');
const baseline = resolve(studio, 'scripts/fixtures/surface-parity/desktop');
mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json' };
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = path.startsWith('/test-module/') ? resolve(repo, 'apps/ecommerce-cms-agentsam/frontend/theme-editor', path.slice(13)) : resolve(root, '.' + path);
  if (!file.startsWith(repo + '/') || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('content-type', mime[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.CHROME_BIN || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
try {
  await page.goto(origin + '/index.html#/agentsam');
  await page.locator('[data-agentsam-app-shell="local-studio"]').waitFor();
  await page.locator('[data-agent-composer] textarea').first().waitFor();
  const capture = async (name) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(out, name + '.png'), fullPage: false, animations: 'disabled' });
    if (['work-empty', 'cms-hub', 'cms-theme-editor'].includes(name)) {
      const expected = resolve(baseline, name + '.png');
      if (process.argv.includes('--update-baselines')) { mkdirSync(baseline, { recursive: true }); copyFileSync(resolve(out, name + '.png'), expected); }
      else { assert.ok(existsSync(expected), `Missing ${name} baseline; review captures and run --update-baselines`); assert.ok(changedPixelRatio(readFileSync(resolve(out, name + '.png')), readFileSync(expected)) <= 0.005, `${name} visual regression; inspect ${out}`); }
    }
    const state = await page.evaluate(() => {
      const scope = document.querySelector('.agentsam-shell') || document.body;
      const css = getComputedStyle(scope);
      const tokens = Object.fromEntries(['--nav-canvas','--nav-surface','--nav-text','--nav-accent','--background','--card'].map((t) => [t, css.getPropertyValue(t).trim()]));
      return { route: location.hash, viewport: [innerWidth, innerHeight], tokens, htmlClass: document.documentElement.className, bodyClass: document.body.className, stylesheets: [...document.styleSheets].map((s) => s.href), themes: [...document.querySelectorAll('[data-theme-id]')].map((el) => el.dataset.themeId) };
    });
    writeFileSync(resolve(out, name + '.json'), JSON.stringify(state, null, 2)); return state;
  };
  await capture('work-empty');
  // Exercise the shared mini composer with a long, unsent draft.
  await page.evaluate(() => window.dispatchEvent(new Event('agentsam:annotate')));
  await page.getByText('What should we work on?', { exact: true }).click();
  const mini = page.locator('.mini-agentsam-panel');
  const text = Array.from({ length: 120 }, (_, i) => `Draft line ${i + 1}: review the whole message without truncating it.`).join('\n');
  await mini.locator('textarea').fill(text);
  assert.notEqual(await mini.evaluate((el) => getComputedStyle(el).boxShadow), 'none');
  assert.ok(await mini.locator('.lucide-arrow-up').count(), 'upward send arrow');
  await mini.getByRole('button', { name: 'Expand message' }).click();
  assert.equal(await mini.getAttribute('data-expanded'), 'true');
  assert.equal(await mini.locator('textarea').inputValue(), text);
  await capture('mini-composer-expanded');
  await page.keyboard.press('Escape');
  assert.equal(await mini.getAttribute('data-expanded'), 'false');
  await mini.locator('textarea').dblclick();
  assert.equal(await mini.getAttribute('data-expanded'), 'true');
  assert.equal(await mini.locator('textarea').inputValue(), text);
  await mini.getByRole('button', { name: 'Close miniAgentSam' }).click();
  await page.goto(origin + '/index.html#/cms');
  await page.locator('.iam-cms-hub-page').waitFor();
  await capture('cms-hub');
  await page.goto(origin + '/index.html#/store');
  await page.locator('[data-theme-id]').first().waitFor();
  const storeState = await capture('theme-store');
  const discovered = discoverThemeSurfaces(repo).themes.map((t) => t.id).sort();
  assert.deepEqual(storeState.themes.sort(), discovered);
  await page.goto(origin + '/index.html#/settings/themes');
  await page.locator('[data-theme-id]').first().waitFor();
  assert.deepEqual((await capture('settings-themes')).themes.sort(), discovered);
  // Real theme HTML must survive extraction, draft editing, saving and reloading.
  const result = await page.evaluate(async () => {
    const { extractThemePage, renderThemePage, createThemeProjectAdapter, THEME_PROJECT_SCHEMA } = await import('/test-module/project.mjs');
    const source = '<html><head><style>h1{color:red}</style></head><body><main><section><h1>Hello <em>world</em></h1><p>Original content</p><a href="/shop"><img src="cover.png" alt="Cover"></a></section></main></body></html>';
    const p = extractThemePage(source, { baseUrl: 'https://example.test/theme/' });
    const initial = renderThemePage(p);
    let saved = { schema: THEME_PROJECT_SCHEMA, id: 'test_theme', name: 'Test', tokens: {}, pages: [p] };
    const store = { get: async () => structuredClone(saved), save: async (value) => { saved = structuredClone(value); } };
    const adapter = createThemeProjectAdapter(saved, store);
    const section = (await adapter.getPage('home')).sections[0];
    const field = section.schema.fields.find((f) => section.content[f.key] === 'Original content');
    section.content[field.key] = 'Saved content';
    await adapter.saveDraft('home', section.key, section.content, 0);
    let conflict = false;
    try { await adapter.saveDraft('home', section.key, section.content, 0); } catch (error) { conflict = error.status === 409; }
    const loaded = createThemeProjectAdapter(saved, store);
    const updated = (await loaded.resolvePreview('home')).html;
    const blockPage = extractThemePage('<main><section><article><h2>One</h2></article><article><h2>Two</h2></article></section></main>');
    saved.pages = [blockPage];
    const blocks = createThemeProjectAdapter(saved, store);
    const copy = await blocks.duplicateBlock('home', 'section_1', 'block_1');
    await blocks.moveBlock('home', 'section_1', copy.block_id, 0);
    await blocks.removeBlock('home', 'section_1', 'block_2');
    const blockHtml = (await blocks.resolvePreview('home')).html;
    await blocks.removeSection('home', 'section_1');
    await blocks.addSection('home', 'section_1', 0);
    return { initial, updated, conflict, blockHtml, restored: (await blocks.getPage('home')).sections.length };
  });
  assert.match(result.initial, /Hello <em>world<\/em>/);
  assert.match(result.initial, /src="cover.png"/);
  assert.match(result.updated, /Saved content/);
  assert.equal(result.conflict, true);
  assert.equal((result.blockHtml.match(/<h2[^>]*>One<\/h2>/g) || []).length, 2);
  assert.ok(!result.blockHtml.includes('>Two</h2>'));
  assert.equal(result.restored, 1);
  // Create a real durable draft through the public management UI and mount the donor editor.
  await page.getByRole('button', { name: 'Create theme', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Parity acceptance draft');
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  const editor = page.frameLocator('iframe[title="Theme Editor"]');
  await editor.locator('.te-tree-row').first().waitFor();
  const chrome = await editor.locator('.te-inspector-head').evaluate((el) => ({ background: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
  assert.notEqual(chrome.background, 'rgb(255, 255, 255)');
  assert.notEqual(chrome.color, 'rgb(34, 34, 34)');
  const titleField = editor.locator('.te-field input').first();
  await titleField.fill('Revised theme hero');
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await editor.locator('#te-note').filter({ hasText: 'Draft saved.' }).waitFor();
  await capture('cms-theme-editor');
  assert.ok(await editor.locator('#theme-preview').count());
  assert.equal(await editor.getByRole('button', { name: 'Publish', exact: true }).isDisabled(), true);
  await page.reload();
  await editor.locator('.te-tree-row').first().waitFor();
  assert.equal(await editor.locator('.te-field input').first().inputValue(), 'Revised theme hero');
  await page.goto(origin + '/index.html#/store');
  const packaged = discoverThemeSurfaces(repo).themes.find((t) => t.capabilities.editable && t.pages.some((p) => p.slug === 'home'));
  assert.ok(packaged, 'A real packaged home page is required');
  page.on('pageerror', (error) => console.error('browser-error', error.message));
  await page.evaluate(() => { window.__themeNavigateEvents = []; window.addEventListener('agentsam:navigate', (event) => window.__themeNavigateEvents.push(event.detail)); });
  await page.locator(`[data-theme-id="${packaged.id}"]`).getByRole('button', { name: 'Edit', exact: true }).click();
  await editor.locator('.te-tree-row').first().waitFor({ timeout: 5000 }).catch(async (error) => { console.error('packaged-theme-load', await page.evaluate(() => ({events: window.__themeNavigateEvents, desktop: window.__AGENTSAM_DESKTOP__, hash: location.hash})), page.url(), await page.locator('[role=alert]').allTextContents(), await page.locator('body').innerText()); throw error; });
  assert.ok(await editor.locator('.te-field').count(), 'Real packaged content is editable');
  await editor.getByRole('button', { name: 'Layout', exact: true }).click();
  assert.ok(await editor.getByText('Padding', { exact: true }).count());
  await capture('packaged-theme-editor');
  console.log('[theme-surfaces] PASS mini long draft/review, package discovery, persistence, conflict, real preview, editor reload; themes=' + discovered.length);
} finally { await browser.close(); await new Promise((r) => server.close(r)); }
