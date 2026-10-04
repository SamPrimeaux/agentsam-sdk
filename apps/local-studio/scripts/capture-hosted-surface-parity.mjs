import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const base = process.env.HOSTED_STUDIO_URL || 'https://agentsam.inneranimalmedia.com';
const out = resolve(import.meta.dirname, '../artifacts/surface-parity/hosted');
const desktop = resolve(import.meta.dirname, '../artifacts/surface-parity/desktop');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined), headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
try {
  for (const [name, route, selector] of [['work-empty', '/agentsam', '[data-agent-composer]'], ['cms-hub', '/cms', '.iam-cms-hub-page'], ['settings-themes', '/settings/themes', '[data-settings-theme-gallery]']]) {
    await page.goto(base + route);
    await page.locator(selector).first().waitFor({ timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(out, name + '.png'), animations: 'disabled' });
    const state = await page.evaluate(() => {
      const scope = document.querySelector('.agentsam-shell') || document.body;
      const css = getComputedStyle(scope);
      return { route: location.pathname, viewport: [innerWidth, innerHeight], navTheme: scope.closest('[data-nav-theme]')?.getAttribute('data-nav-theme'), tokens: Object.fromEntries(['--nav-canvas','--nav-surface','--nav-text','--nav-accent','--background','--card'].map((t) => [t, css.getPropertyValue(t).trim()])), htmlClass: document.documentElement.className, bodyClass: document.body.className, stylesheets: [...document.styleSheets].map((s) => s.href), themes: [...document.querySelectorAll('[data-theme-id]')].map((el) => el.dataset.themeId) };
    });
    writeFileSync(resolve(out, name + '.json'), JSON.stringify(state, null, 2));
    const expected = JSON.parse(readFileSync(resolve(desktop, name + '.json')));
    assert.deepEqual(state.tokens, expected.tokens, `${name} token parity failed`);
    if (name === 'settings-themes') assert.deepEqual(state.themes.sort(), expected.themes.sort(), 'Hosted/desktop theme inventory differs');
  }
  console.log('[hosted-parity] PASS token and inventory parity');
} finally { await browser.close(); }
