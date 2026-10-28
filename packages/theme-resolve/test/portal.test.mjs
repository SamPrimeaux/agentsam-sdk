import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {
  RESOLVE_PORTAL_BRAND,RESOLVE_PORTAL_TEMPLATES,portalCmsPage,portalHref,portalTemplateForSlug,portalTemplateForPath
} from '../src/portal-templates.mjs';

test('Resolve storefront extends to independently routable account, collections, cart, and password templates',()=>{
 const paths=RESOLVE_PORTAL_TEMPLATES.map(p=>p.path);
 assert.equal(new Set(paths).size,paths.length);
 for(const route of ['collections','collections/atelier','customer/sign-in','customer/sign-up','customer/account',
 'customer/orders','customer/saved','customer/profile','cart','password']) {
  assert.ok(paths.includes(route),route);
  assert.equal(portalTemplateForPath(route)?.path,route);
  assert.equal(portalHref(route),'/themes/resolve/demo/portal/'+route);
 }
 assert.equal(RESOLVE_PORTAL_TEMPLATES.length,10);
});
test('Every portal page maps to a draft CMS page with stable section keys, never a real user/order table',()=>{
 for(const template of RESOLVE_PORTAL_TEMPLATES){
  const page=portalCmsPage(template);
  assert.equal(page.slug,template.slug);
  assert.equal(page.status,'draft');
  assert.equal(page.page_type,'standard');
  assert.equal(page.template_key,template.template_key);
  assert.equal(page.content_authority,'cms-draft');
  assert.ok(page.sections.length>=2);
  assert.equal(new Set(page.sections.map(s=>s.key)).size,page.sections.length);
  assert.ok(page.sections.every(s=>s.status==='draft'));
  assert.equal(JSON.parse(page.metadata_json).preview_only,true);
  assert.equal(portalTemplateForSlug(template.slug),template);
 }
 assert.equal(portalCmsPage(null),null);
});
test('Portal has dynamic branding, parallax and explicit fake-session controls, no credential or payment persistence',()=>{
 const root=new URL('../site/portal/',import.meta.url);
 const html=readFileSync(new URL('index.html',root),'utf8');
 const css=readFileSync(new URL('portal.css',root),'utf8');
 const js=readFileSync(new URL('portal.js',root),'utf8');
 assert.match(html,/customer portal/i);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(js,/sanitizeBrand/);
 assert.match(js,/data-action="demo-sign-in"/);
 assert.match(js,/Password(s)? are not transmitted or stored/);
 assert.match(js,/sessionStorage/);
 assert.match(js,/data-cms-section/);
 assert.match(js,/data-action="add-cart"/);
 assert.match(js,/customer\/sign-up/);
 assert.match(js,/auth-form/);
 assert.doesNotMatch(js,/GitHub Token|githubToken|ghp_/);
 for(const key of ['name','logo_url','accent','glass_opacity','parallax_enabled','parallax_strength'])
  assert.ok(Object.hasOwn(RESOLVE_PORTAL_BRAND,key));
});

test('Portal renders all 10 routes in a minimal browser environment without submitting auth data',()=>{

 const script=readFileSync(new URL('../site/portal/portal.js',import.meta.url),'utf8');
 const paths=RESOLVE_PORTAL_TEMPLATES.map(t=>t.path);
 for(const route of paths){
  const app={innerHTML:'',dataset:{}};
  const callbacks={};
  const origin='http://127.0.0.1:4357';
  const storage=()=>{
   const map=new Map();
   return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
  };
  const location={origin,pathname:'/themes/resolve/demo/portal/'+route,search:''};
  const document={
   baseURI:origin+'/themes/resolve/demo/portal/',
   documentElement:{style:{setProperty:()=>{}}},
   getElementById:id=>id==='app'?app:null,
   querySelectorAll:()=>[],
   addEventListener:(name,fn)=>{(callbacks[name]||=[]).push(fn);}
  };
  const win={};
  Object.assign(win,{
   top:win,parent:win,addEventListener:(name,fn)=>{(callbacks[name]||=[]).push(fn);},
   scrollTo:()=>{}
  });
  const context={
   document,window:win,location,
   localStorage:storage(),sessionStorage:storage(),
   URL,URLSearchParams,console,matchMedia:()=>({matches:false}),
   history:{pushState:(_a,_b,to)=>{location.pathname=new URL(to,origin).pathname;},
     replaceState:(_a,_b,to)=>{location.pathname=new URL(to,origin).pathname;}}
  };
  vm.runInNewContext(script,context,{timeout:1000});
  assert.match(app.innerHTML,/<main\b/,route);
  assert.match(app.innerHTML,/RESOLVE/,route);
  assert.match(app.innerHTML,/No live authentication or payments/,route);
  if(route==='customer/sign-in'){
   assert.match(app.innerHTML,/type="email"/);
   assert.match(app.innerHTML,/type="password"/);
   assert.match(app.innerHTML,/Explore returning customer preview/);
   const btn={dataset:{action:'demo-sign-in'},closest:(q)=>q==='[data-action]'?btn:null};
   for(const cb of callbacks.click||[])cb({target:btn});
   assert.match(app.innerHTML,/Welcome back, <em>Alex/);
   assert.match(app.innerHTML,/Recent orders/);
  }
  if(route==='collections/atelier'){
   assert.match(app.innerHTML,/data-filter/);
   assert.match(app.innerHTML,/Add to bag/);
   const btn={dataset:{action:'add-cart',id:'coat-01'},closest:(q)=>q==='[data-action]'?btn:null};
   for(const cb of callbacks.click||[])cb({target:btn});
   assert.match(app.innerHTML,/Added to your preview bag/);
  }
 }
});
