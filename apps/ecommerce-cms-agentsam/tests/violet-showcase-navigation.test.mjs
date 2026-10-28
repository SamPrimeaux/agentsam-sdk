import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';

const script = readFileSync(new URL('../frontend/static/js/theme-editor.js',import.meta.url),'utf8');
const server = new URL('../scripts/preview-sdk-showcase.mjs',import.meta.url).pathname;

test('Shopify-style storefront template navigation is complete and preview-only mode cannot publish',()=>{
 const expected=['Home page','Products','Collections','Gift card','Cart','Checkout & customer accounts',
   'Blogs','Blog posts','Search','Password','404 page','Create metaobject template'];
 for(const label of expected) assert.ok(script.includes("title: '"+label+"'"),'Missing picker destination: '+label);
 assert.match(script,/function renderPageOptions\(query\)/);
 assert.match(script,/data-picker-category/);
 assert.match(script,/data-picker-back/);
 assert.match(script,/if \(violetShowcase\) \{ setNote\('Violet showcase is UI-only/);
 assert.match(script,/if \(violetShowcase\) \{ setNote\('Violet showcase cannot publish/);
 assert.match(script,/loadStorefrontResources/);
 assert.match(script,/showScaffoldTemplate/);
 assert.match(script,/renderVioletScaffold/);
 assert.match(script,/renderScaffoldInspector/);
 assert.match(script,/data-scaffold-add/);
 assert.match(script,/data-scaffold-field/);
});

test('Violet local preview serves packaged theme, fixtures, and refuses mutations',async(t)=>{
 const port=4368;
 const child=spawn(process.execPath,[server],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
 t.after(()=>child.kill('SIGTERM'));
 const origin='http://127.0.0.1:'+port;
 let started=false;
 for(let attempt=0;attempt<40;attempt++){
  try{const res=await fetch(origin+'/admin/theme-editor?showcase=violet');
   if(res.status===200){started=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,80));
 }
 assert.ok(started,'Local SDK server started');
 const paths=['/admin/theme-editor?showcase=violet','/admin/js/theme-editor.js',
   '/admin/css/theme-editor.css','/themes/violet/demo/',
   '/themes/violet/demo/global/cpas-public-surface.css',
   '/themes/violet/demo/assets/generated/theme-mark.svg',
   '/api/admin/cms/pages','/api/admin/cms/pages/home'];
 for(const path of paths){
   const response=await fetch(origin+path);
   assert.equal(response.status,200,'Expected local preview asset '+path);
 }
 const violet=await(await fetch(origin+'/themes/violet/demo/')).text();
 assert.match(violet,/Violet Initiative/);
 const pages=await(await fetch(origin+'/api/admin/cms/pages')).json();
 assert.ok(pages.pages.some(page=>page.slug==='home'));
 assert.ok(pages.pages.some(page=>page.slug==='about'));
 const write=await fetch(origin+'/api/admin/cms/pages/home',{method:'POST'});
 assert.notEqual(write.status,200,'Fixture server must not accept mutations');
});
