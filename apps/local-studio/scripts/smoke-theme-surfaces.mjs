import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
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
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
try {
  await page.goto(origin + '/index.html#/agentsam');
  await page.locator('[data-agentsam-app-shell="local-studio"]').waitFor({ state: 'visible' });
  await page.locator('.agentsam-shell').waitFor({ state: 'visible' });
  await page.locator('[data-agent-composer] textarea').first().waitFor({ state: 'visible' });
  await page.getByText('Home', { exact: true }).first().waitFor({ state: 'visible' });
  await page.getByText('Work', { exact: true }).first().waitFor({ state: 'visible' });
  await page.getByText('What should we work on?', { exact: true }).waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  const capture = async (name) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(out, name + '.png'), fullPage: false, animations: 'disabled' });
    if (['work-empty', 'settings-themes'].includes(name)) {
      const expected = resolve(baseline, name + '.png');
      if (process.argv.includes('--update-baselines')) {
        mkdirSync(baseline, { recursive: true });
        copyFileSync(resolve(out, name + '.png'), expected);
        console.log(`[theme-surfaces] updated baseline: ${name}`);
      } else {
        assert.ok(existsSync(expected), `Missing ${name} baseline; review captures and run --update-baselines`);
        // Settings cards can vary slightly with macOS font rasterization.
        const threshold = name === 'settings-themes' ? 0.006 : 0.005;
        assert.ok(changedPixelRatio(readFileSync(resolve(out, name + '.png')), readFileSync(expected)) <= threshold, `${name} visual regression; inspect ${out}`);
      }
    }
    const state = await page.evaluate(() => {
      const scope = document.querySelector('.agentsam-shell') || document.body;
      const css = getComputedStyle(scope);
      const tokens = Object.fromEntries(['--nav-canvas','--nav-surface','--nav-text','--nav-accent','--background','--card'].map((t) => [t, css.getPropertyValue(t).trim()]));
      return { route: location.hash, viewport: [innerWidth, innerHeight], tokens, htmlClass: document.documentElement.className, bodyClass: document.body.className, stylesheets: [...document.styleSheets].map((s) => s.href), themes: [...document.querySelectorAll('[data-theme-id]')].map((el) => el.dataset.themeId) };
    });
    writeFileSync(resolve(out, name + '.json'), JSON.stringify(state, null, 2)); return state;
  };
  await page.locator('#agentsam-desktop-boot').waitFor({ state: 'detached', timeout: 5000 });
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
  // /cms is a compatibility alias for the canonical Online Store route.
  await page.goto(origin + '/index.html#/cms');
  await page.getByRole('heading', { name: 'Online Store', exact: true }).waitFor();
  await capture('online-store-home');
  await page.goto(origin + '/index.html#/admin/themes');
  await page.locator('[data-theme-store-handoff]').waitFor();
  const storeLink = page.locator('a[href="https://themes.inneranimalmedia.com/"]');
  await storeLink.waitFor();
  assert.equal(await page.locator('[data-theme-id]').count(), 0, 'SDK must not render a duplicate storefront theme catalog');
  await capture('theme-store-handoff');
  await page.goto(origin + '/index.html#/admin/settings/themes');
  // The live static smoke has no account theme API, so verify the real gallery
  // surface and inspect any returned records without requiring fixture themes.
  await page.locator('[data-settings-theme-gallery]').waitFor();
  const appearanceThemes = (await capture('settings-themes')).themes;
  const storefrontSlugs = new Set(['cypress','ember','forge','grove','harbor','iapj','iasf','plain-jane','resolve','revise','summit','violet']);
  assert.ok(appearanceThemes.every(id => !storefrontSlugs.has(id)), 'cms_themes must not contain storefront package inventory');
  // Real theme HTML must survive extraction, draft editing, saving and reloading.
  const result = await page.evaluate(async () => {
    const { extractThemePage, renderThemePage, createThemeProjectAdapter, THEME_PROJECT_SCHEMA, sourceSectionTemplateKey } = await import('/test-module/project.mjs');
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
    const chromePage = extractThemePage('<body><header aria-label="Site header"><nav><ul><li><a href="/">Home</a></li><li><a href="/about">About</a></li></ul></nav></header><main><section id="built-in-the-garage"><h2>Built in the Garage</h2><p>Real section copy</p></section></main><footer><p>Footer copy</p></footer></body>');
    const chromeSummary = chromePage.sections.map((section) => ({
      label: section.schema.label,
      zone: section.schema.zone,
      blockCount: section.schema.blocks.length,
      fieldKeys: section.schema.fields.map((field) => field.key),
    }));
    const blockPage = extractThemePage('<main><section><article><h2>One</h2></article><article><h2>Two</h2></article></section></main>');
    saved.pages = [blockPage];
    const blocks = createThemeProjectAdapter(saved, store);
    const copy = await blocks.duplicateBlock('home', 'section_1', 'block_1');
    await blocks.moveBlock('home', 'section_1', copy.block_id, 0);
    await blocks.removeBlock('home', 'section_1', 'block_2');
    const blockHtml = (await blocks.resolvePreview('home')).html;
    await blocks.removeSection('home', 'section_1');
    await blocks.addSection('home', sourceSectionTemplateKey('home', 'section_1'), 0);
    return { initial, updated, conflict, chromeSummary, blockHtml, restored: (await blocks.getPage('home')).sections.length };
  });
  assert.match(result.initial, /Hello <em[^>]*>world<\/em>/);
  assert.match(result.initial, /src="cover.png"/);
  assert.match(result.updated, /Saved content/);
  assert.equal(result.conflict, true);
  assert.deepEqual(result.chromeSummary.map((section) => section.zone), ['HEADER', 'BODY', 'FOOTER']);
  assert.deepEqual(result.chromeSummary.map((section) => section.label), ['Site header', 'Built in the Garage', 'Site footer']);
  assert.equal(result.chromeSummary[0].blockCount, 0, 'navigation list items must not become fake content blocks');
  assert.ok(result.chromeSummary[1].fieldKeys.includes('heading_1'));
  assert.ok(result.chromeSummary[1].fieldKeys.includes('text_1'));
  assert.equal((result.blockHtml.match(/<h2[^>]*>One<\/h2>/g) || []).length, 2);
  assert.ok(!result.blockHtml.includes('>Two</h2>'));
  assert.equal(result.restored, 1);
  // Create a real durable draft through the public management UI and mount the packaged editor.
  // Theme Studio is owned by the installed Ecommerce + CMS app, not Settings.
  // Verify the canonical packaged entrypoint and bootstrap rather than driving
  // the retired standalone Settings-to-editor flow.
  const ecommerceAdmin = resolve(root, 'ecommerce-cms-agentsam/admin');
  const themeEditorHtml = resolve(ecommerceAdmin, 'theme-editor.html');
  const themeStudioBootstrap = resolve(ecommerceAdmin, 'js/theme-studio-bootstrap.mjs');
  assert.ok(existsSync(themeEditorHtml) && statSync(themeEditorHtml).size > 0, 'canonical Ecommerce Theme Studio document is missing');
  assert.ok(existsSync(themeStudioBootstrap) && statSync(themeStudioBootstrap).size > 0, 'canonical Theme Studio bootstrap is missing');
  const themeEditorDocument = readFileSync(themeEditorHtml, 'utf8');
  assert.match(themeEditorDocument, /iframe id="theme-project-editor-frame" title="Theme Studio editor"/);
  assert.match(themeEditorDocument, /js\/theme-studio-bootstrap\.mjs/);
  const themeStudioSource = readFileSync(themeStudioBootstrap, 'utf8');
  assert.match(themeStudioSource, /async function bootNewTheme\(/);
  assert.match(themeStudioSource, /themeProjectEditorPath/);
  const localThemeRoot = resolve(root, 'themes');
  if (existsSync(localThemeRoot)) {
    const bundledPages = await (await import('node:fs/promises')).readdir(localThemeRoot, { withFileTypes: true });
    assert.ok(!bundledPages.some(entry => entry.isDirectory() && existsSync(resolve(localThemeRoot, entry.name, 'index.html'))),
      'Storefront package preview pages must not be bundled into Local Studio');
  }
  console.log('[theme-surfaces] PASS mini composer, Online Store compatibility route, appearance theme gallery, cms_themes separation, canonical Theme Studio package and project persistence; no bundled storefront previews');
} finally { await browser.close(); await new Promise((r) => server.close(r)); }
