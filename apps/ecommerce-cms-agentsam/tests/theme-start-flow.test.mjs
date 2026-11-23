import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
// Browser acceptance runs only where the real Playwright/Chrome runtime exists.
const playwright = await import('playwright').catch(() => null);
const chromePath = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : playwright?.chromium?.executablePath?.();
const browserAvailable = Boolean(playwright && chromePath && existsSync(chromePath));
import { themeStartPrompt } from '../frontend/theme-editor/theme-start.mjs';

test('new theme guidance is scoped to Ecommerce CMS and never claims to read unavailable files', () => {
  const prompt = themeStartPrompt({siteName:'Example',projectName:'New theme'});
  assert.match(prompt,/private Ecommerce CMS theme draft/);
  assert.match(prompt,/not Design Canvas/);
  assert.match(prompt,/Do not claim to have read anything you cannot access/);
  assert.match(prompt,/Do not publish or change existing pages without my approval/);
});

test('Theme Studio opens packaged AgentSam and offers real next steps', async () => {
  const source = readFileSync(new URL('../frontend/theme-editor/theme-start.mjs', import.meta.url));
  const server = createServer((req,res) => {
    if (req.url === '/theme-start.mjs') {
      res.writeHead(200,{'content-type':'text/javascript'});
      res.end(source);
    } else {
      res.writeHead(200,{'content-type':'text/html'});
      res.end(`<!doctype html><html><body><div class="te-preview-stage"></div><div id="agentsam-drawer"></div>
        <form id="agentsam-form" aria-busy="false"><textarea id="agentsam-input"></textarea></form>
        <button id="te-add-section">Add section</button></body></html>`);
    }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    const address = `http://127.0.0.1:${server.address().port}`;
    const page = await browser.newPage();
    await page.goto(address);
    const startup = await page.evaluate(async () => {
      const {startThemeGuidance} = await import('/theme-start.mjs');
      window.messages=[];window.drawerOpens=0;window.sectionOpens=0;
      window.openAgentsamDrawer=()=>window.drawerOpens++;
      window.sendAgentsamMessage=async (text,options)=>window.messages.push({text,options});
      document.getElementById('te-add-section').onclick=()=>window.sectionOpens++;
      await startThemeGuidance({contentWindow:window,contentDocument:document},{
        siteId:'site_one',projectId:'theme_one',siteName:'Example Site',projectName:'New theme',
      });
      return {title:document.querySelector('.te-theme-start h2')?.textContent,
        actions:document.querySelectorAll('.te-theme-start__choice').length,
        requests:window.messages.length,context:window.messages[0]?.options.context,
        drawerOpens:window.drawerOpens};
    });
    assert.equal(startup.title,'What direction are you feeling?');
    assert.equal(startup.actions,3);
    assert.equal(startup.requests,1);
    assert.equal(startup.context.site_id,'site_one');
    assert.equal(startup.context.project_id,'theme_one');
    assert.ok(startup.drawerOpens > 0);
    await page.getByRole('button',{name:/Explore visual directions/}).click();
    assert.equal(await page.evaluate(()=>window.messages.length),2);
    assert.equal(await page.locator('.te-theme-start').count(),0);
    await page.evaluate(async () => {
      const {renderThemeStart} = await import('/theme-start.mjs');
      renderThemeStart(document,{onSelect:id=>{if(id==='sections')document.getElementById('te-add-section').click();}});
    });
    await page.getByRole('button',{name:/Build section by section/}).click();
    assert.equal(await page.evaluate(()=>window.sectionOpens),1);
    await page.evaluate(async () => {
      const {renderThemeStart,startThemeGuidance} = await import('/theme-start.mjs');
      renderThemeStart(document,{}).remove();
      document.getElementById('agentsam-form').setAttribute('aria-busy','true');
      await startThemeGuidance({contentWindow:window,contentDocument:document},{
        siteId:'site_one',projectId:'theme_one',siteName:'Example Site',projectName:'New theme'});
    });
    await page.getByRole('button',{name:/Use my existing site/}).click();
    assert.equal(await page.evaluate(()=>window.messages.length),2,'busy composer never fires a competing request');
    assert.match(await page.locator('#agentsam-input').inputValue(),/authorized existing site pages/);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
