import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {handleStudioSitesOverview} from '../backend/worker/studio-sites-overview.js';
import {handleStudioThemeDrafts} from '../backend/worker/studio-theme-drafts.js';
const base='https://agentsam.inneranimalmedia.com';
function fixture(){
 const rows=new Map();
 const projects=new Map();
 const calls=[];
 const env={
  ASSETS:{fetch:async()=>Response.json({products:[
   {slug:'violet',preview_ready:true,package:'@inneranimalmedia/theme-violet',version:'2.6.13',sku:'theme-violet-starter',name:'Violet',category:'Nonprofit',preview_url:'/themes/violet/demo/'},
   {slug:'resolve',preview_ready:true,package:'@inneranimalmedia/theme-resolve',version:'2.6.13',sku:'theme-resolve-starter',name:'Resolve',category:'Commerce',preview_url:'/themes/resolve/demo/'},
  ]})},
  DB:{prepare(sql){
   return {
    bind(...args){
     calls.push({sql,args});
     return {
      all:async()=>({results:sql.includes('FROM cms_themes')?[...rows.values()].filter(row=>row.workspace_id===args[0]):sql.includes('FROM cms_globals')?(projects.get(args[0])||[]):[]}),
      first:async()=>[...rows.values()].find(row=>row.workspace_id===args[0]&&row.slug===args[1])||null,
      run:async()=>{
       if(sql.startsWith('INSERT INTO cms_themes')){
        const [id,name,slug,config,workspace_id]=args;
        if(!rows.has(slug))rows.set(slug,{id,name,slug,config,workspace_id,created_at:'2026-10-28T00:00:00Z'});
       }
       return {meta:{changes:1}};
      }
     };
    },
    first:async()=>({id:'site_mock'})
   };
  }}
 };
 return {env,rows,calls,projects};
}
test('unlinked studio store uses cms_sites, never unscoped legacy Ecommerce tables',async()=>{
 const {env,calls}=fixture();
 const result=await handleStudioSitesOverview(new Request(base+'/api/admin/store/online'),env,'user-1');
 const data=await result.json();
 assert.equal(result.status,200);
 assert.equal(data.active_theme,null);
 assert.equal(data.store.visibility,'unpublished');
 assert.equal(data.setup_required,true);
 assert.deepEqual(data.pages,[]);
 assert.ok(calls.every(c=>!c.sql.includes('page_sections')));
});
test('template Add really stores a private, workspace-scoped CMS draft',async()=>{
 const {env,rows}=fixture();
 const url=base+'/api/admin/theme-products/drafts';
 const post=()=>new Request(url,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({slug:'violet'})});
 const first=await handleStudioThemeDrafts(post(),env,'user-1');
 assert.equal(first.status,201);
 const created=await first.json();
 assert.equal(created.ok,true);
 assert.equal(created.draft.status,'draft');
 assert.equal(created.draft.installed,false);
 assert.equal(rows.size,1);
 const second=await handleStudioThemeDrafts(post(),env,'user-1');
 assert.equal(second.status,201);
 assert.equal(rows.size,1);
 const listing=await handleStudioThemeDrafts(new Request(url),env,'user-1');
 const data=await listing.json();
 assert.equal(data.drafts.length,1);
 assert.equal(data.drafts[0].slug,'violet');
 const other=await handleStudioThemeDrafts(new Request(url),env,'user-2');
 assert.equal((await other.json()).drafts.length,0);
});
test('online store projects private theme drafts from the same CMS authority',async()=>{
 const {env}=fixture();
 const url=base+'/api/admin/theme-products/drafts';
 const request=new Request(url,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({slug:'violet'})});
 assert.equal((await handleStudioThemeDrafts(request,env,'user-1')).status,201);
 const projected=await handleStudioSitesOverview(new Request(base+'/api/admin/store/online'),env,'user-1');
 const data=await projected.json();
 assert.equal(data.draft_themes.length,1);
 assert.equal(data.draft_themes[0].slug,'violet');
 assert.equal(data.draft_themes[0].site_linked,false);
 assert.equal(data.draft_themes[0].edit_href,null);
 const other=await handleStudioSitesOverview(new Request(base+'/api/admin/store/online'),env,'user-2');
 assert.equal((await other.json()).draft_themes.length,0);
});
test('installed CMS v2 projects supersede legacy selections and expose only an account-owned editor',async()=>{
 const {env,projects}=fixture();
 const url=base+'/api/admin/theme-products/drafts';
 await handleStudioThemeDrafts(new Request(url,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({slug:'resolve'})}),env,'user-1');
 projects.set('user-1',[{inline_content_json:JSON.stringify({
   id:'theme_resolve',name:'Resolve',sourceThemeId:'resolve',
   packageName:'@inneranimalmedia/theme-resolve',sourcePackageVersion:'2.6.13',
   sourcePreviewUrl:'/themes/resolve/demo/',createdAt:'2026-10-29T12:00:00Z'
 })}]);
 const read=async account=>(await (await handleStudioSitesOverview(
   new Request(base+'/api/admin/store/online'),env,account)).json());
 const mine=await read('user-1');
 assert.equal(mine.draft_themes.length,1,'an installed project replaces its placeholder');
 assert.equal(mine.draft_themes[0].installed,true);
 assert.equal(mine.draft_themes[0].edit_href,'/admin/theme-project-editor?project=theme_resolve');
 assert.equal(mine.preview_theme.preview_href,'/themes/resolve/demo/');
 assert.equal(mine.active_theme,null,'draft preview never becomes published');
 const other=await read('user-2');
 assert.equal(other.preview_theme,null);
 assert.deepEqual(other.draft_themes,[]);
});
test('template draft creation refuses unauthenticated, CSRF and unsupported catalog writes',async()=>{
 const {env,rows}=fixture(),url=base+'/api/admin/theme-products/drafts';
 const payload=(body,headers={})=>new Request(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await handleStudioThemeDrafts(payload({slug:'violet'}),env,null)).status,401);
 assert.equal((await handleStudioThemeDrafts(payload({slug:'violet'}),env,'user-1')).status,403);
 assert.equal((await handleStudioThemeDrafts(payload({slug:'unknown'},{origin:base}),env,'user-1')).status,400);
 assert.equal(rows.size,0);
});
test('retired Atlas route is absent, redirects to the single Theme Studio, and Settings loads client-side',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const read=relative=>readFileSync(path.join(root,relative),'utf8');
 assert.doesNotMatch(read('../ecommerce-cms-agentsam/backend/lib/route-manifest.js'),/id: "admin.revise-atlas"/);
 assert.match(read('backend/worker/index.js'),/url.pathname === "\/admin\/revise-atlas"/);
 assert.match(read('frontend/src/routes/(apps)/settings/$unit.tsx'),/import\("@\/components\/settings\/LocalStudioSettingsPage"\)/);
 const browser=read('../ecommerce-cms-agentsam/frontend/static/js/theme-product-browser.js');
 assert.match(browser,/Add to Drafts/);
 assert.match(browser,/Explore preview/);
 assert.doesNotMatch(browser,/theme-marketplace-dialog/);
 const editor=read('../ecommerce-cms-agentsam/frontend/static/js/theme-editor.js');
 assert.match(editor,/const host = showcaseTheme \? null/);
 assert.match(editor,/data-picker-preset/);
 assert.match(editor,/journal-the-art-of-slow-travel/);
 assert.match(editor,/resolve-product/);

});

test('Theme Studio assistant uses an in-flow dock on desktop, not a modal backdrop',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const source=readFileSync(path.join(root,'../ecommerce-cms-agentsam/frontend/static/js/agentsam.js'),'utf8');
 assert.match(source,/location\.pathname === "\/admin\/theme-editor"/);
 assert.match(source,/className="agentsam-dock"/);
 assert.match(source,/main\.insertAdjacentElement\("afterend",dock\)/);
});
