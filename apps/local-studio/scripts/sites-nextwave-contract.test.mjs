import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {handleStudioSitesOverview} from '../backend/worker/studio-sites-overview.js';
import {handleStudioThemeDrafts} from '../backend/worker/studio-theme-drafts.js';
const base='https://agentsam.inneranimalmedia.com';
const themeHash='a'.repeat(64);
const themeStoreFetch=async input=>{
 const url=String(input);
 if(url.endsWith('/api/install-index'))return Response.json({
  ok:true,schema:'agentsam.website-theme-install-index.v1',packages:['violet','resolve'].map(slug=>({
   slug,version:'2.6.13',sha256:themeHash,page_count:4,manifest_page_count:4,
   project_sha256:themeHash,project_key:'install-projects/'+slug+'/2.6.13/'+themeHash+'.json',
   project_url:'/api/themes/'+slug+'/2.6.13/project'
  }))
 });
 if(url.endsWith('/api/catalog'))return Response.json({ok:true,schema:'iam.theme-catalog.v1',products:['violet','resolve'].map(slug=>({
  slug,sku:'iam.theme.'+slug,name:slug==='violet'?'Violet':'Resolve',category:slug==='violet'?'Nonprofit':'Commerce',
  summary:slug+' theme',publisher:'InnerAnimalMedia',version:'2.6.13',
  previewUrl:'https://themes.inneranimalmedia.com/themes/'+slug+'/presets/'+slug+'/demo/',
  release:{status:'published',sha256:themeHash,storageKey:'releases/'+slug+'/2.6.13/'+themeHash+'.zip'}
 }))});
 throw new Error('Unexpected Theme Store request: '+url);
};
async function withThemeStore(run){
 const previous=globalThis.fetch;globalThis.fetch=themeStoreFetch;
 try{return await run();}finally{globalThis.fetch=previous;}
}
function fixture(){
 const rows=new Map();
 const projects=new Map();
 const sites=new Map();
 const calls=[];
 const env={
  DB:{prepare(sql){
   return {
    bind(...args){
     calls.push({sql,args});
     return {
      all:async()=>({results:sql.includes('FROM projects p')?(sites.get(args[0])||[]):sql.includes('FROM cms_sites')?(sites.get(args[1]||args[0])||[]):sql.includes('FROM cms_themes')?[...rows.values()].filter(row=>row.workspace_id===args[0]):sql.includes('FROM cms_globals')?(projects.get(args[0])||[]):[]}),
      first:async()=>sql.includes('FROM cms_sites')
        ? (sites.get(args[1] || args[0]) || []).find(site=>!args[0] || site.id===args[0]) || null
        : [...rows.values()].find(row=>row.workspace_id===args[0]&&row.slug===args[1])||null,
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
 return {env,rows,calls,projects,sites};
}
test('unlinked studio store uses cms_sites, never unscoped legacy Ecommerce tables',async()=>{
 const {env,calls}=fixture();
 const result=await handleStudioSitesOverview(new Request(base+'/api/admin/store/online'),env,'au_testuser1');
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
 const first=await withThemeStore(()=>handleStudioThemeDrafts(post(),env,'au_testuser1'));
 assert.equal(first.status,201);
 const created=await first.json();
 assert.equal(created.ok,true);
 assert.equal(created.draft.status,'draft');
 assert.equal(created.draft.installed,false);
 assert.equal(rows.size,1);
 const second=await withThemeStore(()=>handleStudioThemeDrafts(post(),env,'au_testuser1'));
 assert.equal(second.status,201);
 assert.equal(rows.size,1);
 const listing=await handleStudioThemeDrafts(new Request(url),env,'au_testuser1');
 const data=await listing.json();
 assert.equal(data.drafts.length,1);
 assert.equal(data.drafts[0].slug,'violet');
 const other=await handleStudioThemeDrafts(new Request(url),env,'au_testuser2');
 assert.equal((await other.json()).drafts.length,0);
});
test('online store projects private theme drafts from the same CMS authority',async()=>{
 const {env}=fixture();
 const url=base+'/api/admin/theme-products/drafts';
 const request=new Request(url,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({slug:'violet'})});
 assert.equal((await withThemeStore(()=>handleStudioThemeDrafts(request,env,'au_testuser1'))).status,201);
 const projected=await handleStudioSitesOverview(new Request(base+'/api/admin/store/online'),env,'au_testuser1');
 const data=await projected.json();
 assert.deepEqual(data.draft_themes,[],'an unlinked selection is not represented as a site-owned draft');
 const accountDrafts=await handleStudioThemeDrafts(new Request(url),env,'au_testuser1');
 const accountDraftData=await accountDrafts.json();
 assert.equal(accountDraftData.drafts.length,1);
 assert.equal(accountDraftData.drafts[0].slug,'violet');
 assert.equal(accountDraftData.drafts[0].site_linked,false);
 const other=await handleStudioThemeDrafts(new Request(url),env,'au_testuser2');
 assert.equal((await other.json()).drafts.length,0);
});
test('installed CMS v2 projects supersede legacy selections and expose only an account-owned editor',async()=>{
 const {env,projects,sites}=fixture();
 const url=base+'/api/admin/theme-products/drafts';
 await withThemeStore(()=>handleStudioThemeDrafts(new Request(url,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({slug:'resolve'})}),env,'au_testuser1'));
 sites.set('au_testuser1',[{id:'site_mock',project_id:'site_mock',account_id:'au_testuser1',name:'Default site',slug:'default',status:'active',is_default:1,page_count:0,worker_id:null,metadata_json:'{}',tenant_id:'tenant_mock',workspace_id:'workspace_mock',domain:null,role:'owner'}]);
 projects.set('au_testuser1',[{site_id:'site_mock',site_name:'Default site',site_slug:'default',inline_content_json:JSON.stringify({
   id:'theme_resolve',name:'Resolve',sourceThemeId:'resolve',
   packageName:'@inneranimalmedia/theme-resolve',sourcePackageVersion:'2.6.13',
   sourcePreviewUrl:'/themes/resolve/demo/',createdAt:'2026-10-29T12:00:00Z'
 })}]);
 const read=async account=>(await (await handleStudioSitesOverview(
   new Request(base+'/api/admin/store/online'),env,account)).json());
 const mine=await read('au_testuser1');
 assert.equal(mine.draft_themes.length,1,'an installed project replaces its placeholder');
 assert.equal(mine.draft_themes[0].installed,true,JSON.stringify(mine));
 assert.equal(mine.draft_themes[0].edit_href,'/admin/sites/site_mock/themes/theme_resolve/editor/home');
 assert.equal(mine.preview_theme.preview_href,null,'unverified source previews are not presented as local previews');
 assert.equal(mine.preview_theme.source_preview_href,'https://themes.inneranimalmedia.com/theme-packages/resolve/2.6.13/preview/');
 assert.equal(mine.active_theme,null,'draft preview never becomes published');
 const other=await read('au_testuser2');
 assert.equal(other.preview_theme,null);
 assert.deepEqual(other.draft_themes,[]);
});
test('template draft creation refuses unauthenticated, CSRF and unsupported catalog writes',async()=>{
 const {env,rows}=fixture(),url=base+'/api/admin/theme-products/drafts';
 const payload=(body,headers={})=>new Request(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await handleStudioThemeDrafts(payload({slug:'violet'}),env,null)).status,401);
 assert.equal((await handleStudioThemeDrafts(payload({slug:'violet'}),env,'au_testuser1')).status,403);
 assert.equal((await handleStudioThemeDrafts(payload({slug:'unknown'},{origin:base}),env,'au_testuser1')).status,400);
 assert.equal(rows.size,0);
});
test('retired Atlas route is absent, redirects to the single Theme Studio, and Settings loads client-side',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const read=relative=>readFileSync(path.join(root,relative),'utf8');
 assert.doesNotMatch(read('../ecommerce-cms-agentsam/backend/lib/route-manifest.js'),/id: "admin.revise-atlas"/);
 assert.match(read('backend/worker/index.js'),/url.pathname === "\/admin\/revise-atlas"/);
 assert.match(read('frontend/src/routes/(apps)/settings/$unit.tsx'),/Navigate to="\/admin\/settings\/\$unit"/);
 const browser=read('../ecommerce-cms-agentsam/frontend/static/js/theme-product-browser.js');
 assert.match(browser,/Add to Drafts/);
 assert.match(browser,/Explore preview/);
 assert.doesNotMatch(browser,/theme-marketplace-dialog/);
 const editor=read('../ecommerce-cms-agentsam/frontend/static/js/theme-editor.js');
 assert.match(editor,/const host = window\.AgentSamThemeEditorHost \|\| null/);
 assert.match(editor,/const editorRequest = host \? host\.adapter\.request\.bind\(host\.adapter\) : \(window\.cmsAdminFetch \|\| window\.adminFetch\)/);
 assert.match(editor,/selectedStyleFieldKey/);
 assert.match(editor,/scheduleLocalPreview/);
 assert.match(editor,/themeStyles/);

});

test('Theme Studio assistant uses an in-flow dock on desktop, not a modal backdrop',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const source=readFileSync(path.join(root,'../ecommerce-cms-agentsam/frontend/static/js/agentsam.js'),'utf8');
 assert.match(source,/location\.pathname === "\/admin\/theme-editor"/);
 assert.match(source,/className="agentsam-dock"/);
 assert.match(source,/main\.insertAdjacentElement\("afterend",dock\)/);
});
