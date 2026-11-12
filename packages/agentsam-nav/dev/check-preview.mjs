/* Development-only browser acceptance for actual packaged Nav + Workbench components. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = fileURLToPath(new URL('.generated/', import.meta.url));
const require = createRequire(fileURLToPath(new URL('../../../apps/local-studio/package.json', import.meta.url)));
const { chromium } = require('playwright');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  try {
    const location = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const local = resolve(root, '.' + (location === '/dev/' ? '/dev/index.html' : location));
    if (!local.startsWith(root + sep)) throw Error('outside preview');
    const bytes = await readFile(local);
    response.writeHead(200, { 'content-type': types[extname(local)] || 'application/octet-stream' }); response.end(bytes);
  } catch { response.writeHead(404); response.end('not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port + '/dev/', { waitUntil: 'networkidle' });
  if (!await page.getByRole('heading', {name: 'Packaged components'}).isVisible()) throw Error('preview did not render');
  await page.getByRole('button', {name: 'Conversation options'}).click();
  if (!await page.getByRole('menuitem', {name: 'Rename'}).isVisible()) throw Error('rename missing');
  if (!await page.getByRole('menuitem', {name: 'Move to project'}).isVisible()) throw Error('project submenu missing');
  await page.getByRole('menuitem', {name: 'Rename'}).click();
  await page.getByRole('dialog').getByRole('textbox', {name: 'Rename conversation'}).fill('Updated preview chat');
  await page.getByRole('dialog').getByRole('button', {name: 'Save'}).click();
  if (!await page.getByText('Updated preview chat').isVisible()) throw Error('rename state missing');
  await page.getByRole('button', {name: 'Toggle pinned summary'}).click();
  if (!await page.getByRole('region', {name: 'Outputs'}).isVisible()) throw Error('outputs missing');
  if (!await page.getByRole('region', {name: 'Sources'}).isVisible()) throw Error('sources missing');
  await page.getByRole('menuitem', {name: 'Add outputs'}).click();
  await page.getByRole('menuitem', {name: 'Create sample output'}).click();
  await page.getByRole('button', {name: 'Toggle pinned summary'}).click();
  if (!await page.getByText('Output 2.md').isVisible()) throw Error('added output missing');
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: 'Inspect menu states'}).click();
  await page.keyboard.press('ArrowDown');
  if (await page.evaluate(() => document.activeElement?.getAttribute('role')) !== 'menuitem') throw Error('menu keyboard navigation failed');
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: 'Disabled: false'}).click();
  if (!await page.locator('.preview-composer textarea').isDisabled()) throw Error('disabled composer not applied');
  await page.getByRole('button', {name: 'Disabled: true'}).click();
  await page.locator('.preview-composer textarea').fill('Composing text');
  await page.locator('.preview-composer textarea').evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })));
  if ((await page.locator('.preview-status').textContent()).includes('Composing text')) throw Error('IME Enter prematurely sent');
  await page.locator('.preview-composer textarea').fill('Composer acceptance');
  await page.locator('.preview-composer textarea').press('Enter');
  if (!(await page.locator('.preview-status').textContent()).includes('Composer acceptance')) throw Error('composer Enter submission failed');
  await page.getByRole('button', {name: 'Theme: dark'}).click();
  await page.getByRole('button', {name: 'Mode: chat'}).click();
  if (await page.locator('.preview-composer textarea').getAttribute('placeholder') !== 'Work with AgentSam') throw Error('Work composer variant missing');
  await page.screenshot({path: output + 'desktop-acceptance.png'});
  await page.setViewportSize({width:390,height:844});
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw Error('mobile overflow');
  await page.getByRole('button', {name: 'Conversation options'}).click();
  const rect = await page.getByRole('menu').first().boundingBox();
  if (!rect || rect.x < -1 || rect.x + rect.width > 391) throw Error('mobile menu collision');
  await page.screenshot({path: output + 'mobile-acceptance.png'});
  if (errors.length) throw Error('runtime errors: ' + errors.join('; '));
  console.log('PASS desktop/mobile: real menus, actions, summary plus, composer, mode/theme, collision, no runtime errors');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
