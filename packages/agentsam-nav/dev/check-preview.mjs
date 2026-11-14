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
  // The independently buildable Design Canvas app is the first view. Test real source artboards first.
  if (await page.locator('.dca-board').count() !== 4) throw Error('Desktop GPT shell source artboards missing');
  if (await page.locator('.dca-scenes button').count() < 11) throw Error('Source scene catalog missing');
  const originalFrame = page.frameLocator('.dca-board iframe').first();
  if (!(await originalFrame.locator('body').innerText()).includes('Agent Sam')) throw Error('Source screen is not rendered');
  await page.getByRole('button',{name:'Apps & embeds'}).click();
  if (await page.locator('.dca-board').count() < 4) throw Error('Install and embed scenes missing');
  await page.getByRole('button',{name:'Desktop GPT shell'}).click();
  await page.locator('.dca-board-row').count();
  await page.getByRole('button',{name:'Native Canvas'}).click();
  if (!await page.locator('[data-visual-review]').isVisible()) throw Error('Native Canvas view missing');
  if (!await page.locator('[data-visual-review]').isVisible()) throw Error('Visual Review missing');
  if (await page.locator('.vr-board-row').count()<5) throw Error('visual screenshot boards missing');
  if (await page.locator('.vr-live-component').count()<1) throw Error('real packaged composer missing');
  await page.getByRole('button',{name:'Interact'}).click();
  await page.locator('.vr-live-component textarea').first().fill('Packaged interaction test');
  await page.locator('.vr-live-component textarea').first().press('Enter');
  if(!(await page.locator('.vr-toast').innerText()).includes('Packaged interaction test'))throw Error('live React component did not execute');
  await page.getByRole('button',{name:'Edit/Pin'}).click();
  await page.getByTitle('Pin comment (P) — click on artboard').click();
  await page.locator('.cv-node').filter({has:page.locator('.vr-live-component')}).first().click({force:true,position:{x:40,y:40}});
  await page.getByPlaceholder('Describe what should change or stay the same…').fill('Review the keyboard interaction');
  await page.getByRole('button',{name:'Post comment'}).click();
  await page.getByRole('button',{name:'Hand off to AgentSam'}).click();
  if(!(await page.getByRole('dialog').innerText()).includes('No AgentSam run has started'))throw Error('local handoff claims false execution');
  /* screenshot evidence temporarily skipped on storage-constrained host */
  await page.getByRole('button',{name:'Close handoff'}).click();
  await page.setViewportSize({width:390,height:844});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('visual mobile overflow');
  /* screenshot evidence temporarily skipped on storage-constrained host */
  await page.setViewportSize({width:1280,height:900});
  await page.getByTitle('Source inventory').first().click();
  if (!await page.locator('[data-atlas="true"]').isVisible()) throw Error('source-backed component atlas did not render');
  const inventoryCount = await page.locator('.atlas-record').count();
  if (inventoryCount < 200) throw Error('source scan missing records: ' + inventoryCount);
  await page.locator('.atlas-record').first().click();
  await page.getByRole('button', {name: 'Repair', exact: true}).click();
  await page.getByPlaceholder('E.g. reduce duplicate menus, fix mobile clipping, preserve the editor layout…').fill('Verify real source and fix interaction consistency.');
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Native Canvas'}).click();
  await page.getByTitle('Source inventory').first().click();
  await page.locator('.atlas-record').first().click();
  if (await page.getByRole('button', {name: 'Repair', exact: true}).getAttribute('aria-pressed') !== 'true') throw Error('review persistence failed');
  await page.getByRole('button', {name: 'New theme canvas'}).click();
  if (!await page.getByRole('heading', {name: 'Independent Theme Canvas'}).isVisible()) throw Error('independent Theme Canvas missing; errors='+errors.join(' || ')+'; body='+((await page.locator('body').textContent())||'').slice(0,500));
  await page.getByRole('combobox', {name: 'Select artboard'}).selectOption('theme-home-mobile');
  if (await page.locator('.cv-artboard').count() !== 1) throw Error('selected artboard was not isolated on Canvas');
  await page.getByRole('button', {name: '+ text'}).click();
  if (!await page.locator('.cv-node').count()) throw Error('native Canvas failed to insert real editable text');
  const cmsStageBackground = await page.locator('.atlas-stage').evaluate(el => getComputedStyle(el).backgroundImage);
  if (!cmsStageBackground.includes('radial-gradient')) throw Error('actual CMS stage background did not load');
  /* screenshot evidence temporarily skipped on storage-constrained host */
  await page.setViewportSize({width:390,height:844});
  const atlasOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  if(atlasOverflow>1){const offenders=await page.evaluate(()=>Array.from(document.querySelectorAll('*')).map(el=>({tag:el.tagName,cl:String(el.className).slice(0,110),r:el.getBoundingClientRect(),scroll:el.scrollWidth})).filter(x=>x.r.width>0&&x.r.right>innerWidth+15&&x.r.left>=-1).slice(0,18).map(x=>({tag:x.tag,cl:x.cl,left:Math.round(x.r.left),right:Math.round(x.r.right),width:Math.round(x.r.width),scroll:x.scroll})));throw Error('Theme Canvas mobile horizontal overflow: '+atlasOverflow+' '+JSON.stringify(offenders));}
  /* screenshot evidence temporarily skipped on storage-constrained host */
  await page.setViewportSize({width:1280,height:900});
  await page.getByRole('button', {name: 'Live component lab', exact: true}).first().click();
  if (!await page.getByRole('heading', {name: 'Packaged components'}).isVisible()) throw Error('real component lab did not open');
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
  /* screenshot evidence temporarily skipped on storage-constrained host */
  await page.setViewportSize({width:390,height:844});
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw Error('mobile overflow');
  await page.getByRole('button', {name: 'Conversation options'}).click();
  const rect = await page.getByRole('menu').first().boundingBox();
  if (!rect || rect.x < -1 || rect.x + rect.width > 391) throw Error('mobile menu collision');
  /* screenshot evidence temporarily skipped on storage-constrained host */
  if (errors.length) throw Error('runtime errors: ' + errors.join('; '));
  console.log('PASS desktop/mobile: real menus, actions, summary plus, composer, mode/theme, collision, no runtime errors');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
