// Rendered mobile acceptance. Run after npm run build in apps/design-canvas.
// PLAYWRIGHT_CHROMIUM_EXECUTABLE optionally selects a locally installed browser.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo=path.resolve(app,'../..');
const {chromium}=await import(pathToFileURL(path.join(repo,'apps/local-studio/node_modules/playwright/index.mjs')).href);
const dist=path.join(app,'dist');
const types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/work/cad/catalog'){res.setHeader('content-type','application/json');res.end(JSON.stringify({items:[]}));return;}
 const file=path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(dist+path.sep)){res.writeHead(403);res.end();return;}
 try{res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const origin='http://127.0.0.1:'+server.address().port;
 for(const width of [390,320]){
  const ctx=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await ctx.newPage();await page.goto(origin);await page.locator('.dcx-create-tile.design').click();
  await page.getByRole('region',{name:'Design editor'}).waitFor();
  await page.getByRole('button',{name:'Add artboard',exact:true}).click();
  await page.getByRole('menuitem',{name:/Landscape/i}).click();
  await page.locator('.dcx-design-canvas-area').waitFor();
  const a=await page.evaluate(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();return {header:rect('.dw-command-bar'),switcher:rect('.dw-mobile-switcher'),tools:rect('.dcx-phone-commands'),canvas:rect('.dcx-design-canvas-area'),width:innerWidth,scroll:document.documentElement.scrollWidth};});
  assert.ok(a.header.bottom<=a.switcher.top+1);assert.ok(a.tools.bottom<=a.header.bottom+1);assert.ok(a.switcher.bottom<=a.canvas.top+1);assert.equal(a.width,a.scroll);assert.ok(a.canvas.height>400);
  for(const label of ['Zoom','Editing tool','Insert','More editor tools']){
   await page.getByRole('button',{name:label,exact:true}).click();const m=page.getByRole('menu',{name:label,exact:true});await m.waitFor();const b=await m.boundingBox();assert.ok(b.x>=-1&&b.x+b.width<=width+1&&b.y>=-1&&b.y+b.height<=845,JSON.stringify(b));
   if(label==='Zoom')await m.getByRole('menuitem',{name:'Fit artboard',exact:true}).click();else await page.keyboard.press('Escape');
   await m.waitFor({state:'hidden'});
  }
  await page.getByRole('button',{name:'Properties',exact:true}).click();await page.waitForTimeout(100);
  assert.equal(await page.locator('.dw-stage').evaluate(e=>getComputedStyle(e).visibility),'visible');
  console.log('PASS',width,'header, tools, menu bounds and visible artboard');await ctx.close();
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
