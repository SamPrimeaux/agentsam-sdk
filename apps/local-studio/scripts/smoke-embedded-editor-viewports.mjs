#!/usr/bin/env node
/**
 * Browser CSS-viewport acceptance for the packaged host's embedded editors.
 * Uses real shared CSS in a representative host fixture. --live additionally
 * checks the standalone SamSpeaks app. Neither replaces signed-in visual QA.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

export const VIEWPORTS = Object.freeze([
  { name:'primary-imac', width:2560, height:1440 },
  { name:'secondary-monitor', width:1920, height:1080 },
  { name:'compact-desktop', width:1600, height:900 },
  { name:'iphone-13-pro', width:390, height:844 },
]);

const css=readFileSync(new URL('../frontend/agentsam/packaged-console-frame.css',import.meta.url),'utf8');
const route=readFileSync(new URL('../frontend/src/routes/(apps)/admin/samspeaks.tsx',import.meta.url),'utf8');
assert.match(route,/data-hosted-app-stage="samspeaks"/);
assert.match(route,/className="absolute inset-0 block size-full border-0"/);

const html=[
  '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">',
  '<style>',
  '*{box-sizing:border-box} html,body{margin:0;width:100%;height:100%;overflow:hidden}',
  '#agentsam-host-workspace{height:100dvh;background:#001a1b}',
  '.agentsam-shell{height:100%;display:flex;flex:1;min-height:0;width:100%}',
  '.agentsam-main{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0}',
  '.platform-console-stage{display:flex;flex:1;min-height:0;min-width:0}',
  '.agentsam-route{flex:1;min-height:0;min-width:0}',
  '[data-host-rail]{width:52px;flex:0 0 52px}',
  '[data-host-header]{height:56px;flex:none}',
  '[data-side-assistant]{flex:none;width:0}',
  'iframe{position:absolute;inset:0;display:block;width:100%;height:100%;border:0}',
  '@media(max-width:600px){[data-host-rail]{display:none}}',
  '</style><style>',css,'</style></head><body>',
  '<div id="agentsam-host-workspace"><div class="agentsam-shell" data-embedded="true">',
  '<nav data-host-rail></nav><div class="agentsam-main"><header data-host-header></header>',
  '<div class="platform-console-stage"><main class="agentsam-route">',
  '<div data-hosted-app-stage="samspeaks"><iframe title="SamSpeaks" src="about:blank"></iframe></div>',
  '</main><aside data-side-assistant></aside></div></div></div></div></body></html>',
].join('\n');

const approx=(actual,expected,label)=>
  assert.ok(Math.abs(actual-expected)<=1.01,label+': expected '+expected+' got '+actual);

const measure=page=>page.evaluate(()=>{
  const rect=selector=>{
    const r=document.querySelector(selector).getBoundingClientRect();
    return {x:r.x,y:r.y,width:r.width,height:r.height};
  };
  return {
    inner:[innerWidth,innerHeight],
    scrollWidth:document.documentElement.scrollWidth,
    header:rect('[data-host-header]'),
    rail:rect('[data-host-rail]'),
    stage:rect('.platform-console-stage'),
    route:rect('.agentsam-route'),
    container:rect('[data-hosted-app-stage]'),
    iframe:rect('iframe'),
  };
});
function check(result,target,label){
  assert.deepEqual(result.inner,[target.width,target.height],label+': actual browser CSS viewport');
  approx(result.scrollWidth,target.width,label+': horizontal overflow');
  approx(result.stage.height,target.height-result.header.height,label+': stage height');
  approx(result.route.height,result.stage.height,label+': route height');
  approx(result.container.height,result.route.height,label+': hosted app height');
  approx(result.iframe.height,result.container.height,label+': iframe height');
  approx(result.iframe.width,result.container.width,label+': iframe width');
  approx(result.iframe.x,result.container.x,label+': iframe left');
  approx(result.iframe.y,result.container.y,label+': iframe top');
  assert.ok(result.iframe.width>200 && result.iframe.height>200,label+': editor stage collapsed');
}
const chrome=process.env.CHROME_BIN||(process.platform==='darwin'
  ?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':null);
const executablePath=chrome && existsSync(chrome)?chrome:undefined;
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
try{
  for(const target of VIEWPORTS){
    const page=await browser.newPage({viewport:{width:target.width,height:target.height}});
    try{
      await page.setContent(html);
      const first=await measure(page);
      check(first,target,target.name);
      await page.locator('[data-host-header]').evaluate(el=>el.style.height='82px');
      const resized=await measure(page);
      check(resized,target,target.name+' expanded header');
      approx(resized.iframe.height,first.iframe.height-26,target.name+': header resize');

      if(target.width>=1600){
        await page.locator('[data-side-assistant]').evaluate(el=>el.style.width='360px');
        const assistant=await measure(page);
        check(assistant,target,target.name+' open assistant');
        approx(assistant.iframe.width,resized.iframe.width-360,target.name+': assistant resize');
      }
      console.log('[embedded-host] PASS '+target.name+' '+target.width+'x'+target.height+
        ' CSS px, available iframe '+Math.round(first.iframe.width)+'x'+Math.round(first.iframe.height));

      if(process.argv.includes('--live')){
        const errors=[];
        page.on('pageerror',err=>errors.push(err.message));
        await page.goto(process.env.SAMSPEAKS_URL||'https://agentsam.inneranimalmedia.com/samspeaks/',{
          waitUntil:'domcontentloaded',timeout:20000,
        });
        await page.locator('canvas').first().waitFor({state:'visible',timeout:15000});
        const live=await page.evaluate(()=>({
          inner:[innerWidth,innerHeight],
          scrollWidth:document.documentElement.scrollWidth,
          canvas:document.querySelectorAll('canvas').length,
        }));
        assert.deepEqual(live.inner,[target.width,target.height]);
        assert.ok(live.canvas>0 && live.scrollWidth<=target.width+1 && errors.length===0,
          target.name+': standalone canvas, horizontal overflow or JS errors');
        console.log('[standalone] PASS '+target.name+' real canvas rendered');
      }
    }finally{await page.close()}
  }
}finally{await browser.close()}
