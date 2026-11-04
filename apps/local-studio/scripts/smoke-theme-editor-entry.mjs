#!/usr/bin/env node
/** Browser smoke for account/site-scoped CMS Theme Editor entry navigation. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import http from 'node:http';
import {chromium} from 'playwright';

const root=new URL('../../ecommerce-cms-agentsam/frontend/static/js/',import.meta.url);
const siteA={id:'site_a',name:'Agency website',is_default:1};
const siteB={id:'site_b',name:'Private Revise draft',status:'draft'};
const cases={
  ambiguous:{sites:[siteA,siteB],pages:[],projects:[]},
  canonical:{sites:[siteA],pages:[{id:'cmsp_about',site_id:'site_a',slug:'about',route_path:'/about',is_homepage:true}],projects:[]},
  draft:{sites:[siteA,siteB],pages:[{id:'cmsp_other',site_id:'site_a',slug:'home',is_homepage:true}],
    projects:[{id:'theme_revise',pages:[{slug:'home',title:'Home'},{slug:'journal',title:'Journal'}]}]},
};
let fixture=cases.ambiguous;
const calls=[];
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const path=url.pathname;
  calls.push(path+url.search);
  const json=(v,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(v));};
  if(path==='/api/admin/cms/sites')return json({ok:true,sites:fixture.sites});
  if(path==='/api/admin/cms/pages')return json({ok:true,pages:fixture.pages.filter(p=>p.site_id===url.searchParams.get('site_id'))});
  if(path==='/api/admin/cms/theme-projects')return json({ok:true,projects:url.searchParams.get('site_id')==='site_b'?fixture.projects:[]});
  if(path==='/admin/js/theme-editor-entry.js'||path==='/admin/js/theme-editor-entry-resolution.mjs'){
    const file=path.endsWith('.mjs')?'theme-editor-entry-resolution.mjs':'theme-editor-entry.js';
    res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    return res.end(readFileSync(new URL(file,root)));
  }
  if(path==='/admin/store'||path==='/admin/pages'||path==='/admin/theme-project-editor'){
    res.writeHead(200,{'content-type':'text/html'});
    return res.end('<!doctype html><title>'+path+'</title><main data-landing="'+path+'">'+path+'</main>');
  }
  if(path==='/admin/theme-editor'){
    res.writeHead(200,{'content-type':'text/html'});
    return res.end('<!doctype html><body><script src="/admin/js/theme-editor-entry.js"></script><script>window.__agentsamThemeEditorEntryReady?.then(r=>{document.body.dataset.ready=String(!!r.ready);});</script></body>');
  }
  res.writeHead(404);res.end('missing');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port,base='http://127.0.0.1:'+port;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
let passed=0;
async function scenario(name,fixtureName,initial,expected,setup) {
  fixture=cases[fixtureName];
  calls.length=0;
  const context=await browser.newContext();
  const page=await context.newPage();
  try {
    if(setup){
      await page.goto(base+'/admin/store');
      await page.evaluate(id=>sessionStorage.setItem('agentsam.cms.selected-site.v1',id),setup);
    }
    await page.goto(base+initial,{waitUntil:'domcontentloaded'});
    if(typeof expected==='string') {
      await page.waitForURL(u=>u.pathname+u.search===expected,{timeout:12000});
    } else if(expected.error){
      await page.locator('[role=alert]').waitFor({state:'visible',timeout:12000});
      assert.match(await page.locator('[role=alert]').innerText(),expected.error);
      assert.equal(new URL(page.url()).pathname,'/admin/theme-editor');
    } else {
      await page.waitForFunction(()=>document.body.dataset.ready==='true',{timeout:12000});
      assert.equal(new URL(page.url()).pathname+new URL(page.url()).search,initial);
    }
    console.log('PASS',name,new URL(page.url()).pathname+new URL(page.url()).search);
    passed++;
  }finally{await context.close();}
}
try {
 await scenario('ambiguous website never assumes home','ambiguous','/admin/theme-editor','/admin/store');
 await scenario('single owned site resolves canonical homepage','canonical','/admin/theme-editor',
   '/admin/theme-editor?slug=about&site_id=site_a&page_id=cmsp_about');
 await scenario('canonical URL is stable and ready','canonical',
   '/admin/theme-editor?slug=about&site_id=site_a&page_id=cmsp_about',{ready:true});
 await scenario('previously chosen private draft resumes own editor','draft','/admin/theme-editor',
   '/admin/theme-project-editor?project=theme_revise&site_id=site_b&page=home','site_b');
 await scenario('private project page deep link','draft',
   '/admin/theme-editor?site_id=site_b&slug=journal',
   '/admin/theme-project-editor?project=theme_revise&site_id=site_b&page=journal');
 await scenario('unauthorized cross-site URL rejected','draft',
   '/admin/theme-editor?site_id=site_other&slug=home',{error:/does not belong/});
 await scenario('stale cross-site page ID rejected','draft',
   '/admin/theme-editor?site_id=site_b&slug=home&page_id=cmsp_other',
   {error:/not part of the selected website/});
 assert.equal(passed,7);
 console.log('PASS authenticated-context browser flow',passed,'scenarios');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
