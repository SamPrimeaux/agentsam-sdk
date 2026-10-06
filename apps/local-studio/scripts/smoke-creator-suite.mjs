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
async function visit(url, marker) {
  await page.goto(origin + '/index.html#' + url);
  await page.locator('[data-studio-product="' + marker + '"]').waitFor({ timeout: 15000 });
}
try {
  await visit('/cms', 'cms-home');
  assert.match(await page.locator('h1').first().innerText(), /Create, edit, and launch/i);
  await visit('/campaigns', 'campaigns');
  await page.getByRole('textbox', { name: 'New campaign name' }).fill('Desktop installation acceptance');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await page.getByText('Draft created on this installation.').waitFor();
  await page.getByLabel('Goal / objective').fill('Introduce our fall collection');
  await page.getByLabel('Audience').fill('Community subscribers');
  await page.getByLabel('Headline', { exact: true }).fill('Built for the hours that matter');
  await page.getByLabel('Email subject').fill('A new fall collection is here');
  await page.getByRole('button', { name: 'Save draft' }).first().click();
  await page.getByText('Draft saved on this installation.').waitFor();
  await page.getByRole('button', { name: 'Build planning brief' }).click();
  await page.getByText(/Evidence sources available:/).waitFor();
  await page.reload();
  await page.locator('[data-studio-product="campaigns"]').waitFor();
  assert.equal(await page.getByLabel('Headline', { exact: true }).inputValue(), 'Built for the hours that matter');
  assert.equal(await page.getByLabel('Email subject').inputValue(), 'A new fall collection is here');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /Desktop-installation-acceptance/);
  await visit('/sites', 'sites');
  await page.getByRole('textbox', { name: 'New site name' }).fill('Desktop sample site');
  await page.getByRole('button', { name: 'Create site draft' }).click();
  await page.frameLocator('iframe[title="Theme Editor"]').locator('.te-tree-row').first().waitFor({ timeout: 15000 });
  await page.goto(origin + '/index.html#/themes');
  await page.locator('[data-theme-id]').first().waitFor({ timeout: 15000 });
  await page.goto(origin + '/index.html#/media');
  await page.getByText('Content Studio', { exact: true }).first().waitFor({ timeout: 15000 });
  assert.equal(jsErrors.length, 0, 'no uncaught client exceptions');
} catch (error) {
  const state = await page.evaluate(() => ({ url: location.href, heading: document.body.innerText.slice(0, 850) })).catch(() => null);
  console.error('[creator-suite] Failure state:', state, jsErrors);
  throw error;
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
console.log('[creator-suite] PASS CMS home, campaign create/save/brief/reload/export, site draft editor');
