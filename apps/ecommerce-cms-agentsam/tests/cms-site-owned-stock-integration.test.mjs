import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadEmbedCatalog} from '../backend/cms/catalog-resource.mjs';
import {createSiteOwnedFixture} from './fixtures/site-owned-cms.mjs';
import {handleAdminCmsApi} from '../backend/cms/api.js';
import {getSiteOwnedPage} from '../backend/cms/site-owned-page-adapter.mjs';
import {previewMerchantPage,publishMerchantPage} from '../backend/cms/page-publication.mjs';
import '../packages/theme-contract/runtime/platform-stock-sections.js';
import '../packages/theme-contract/runtime/portable-sections.js';

const id='platform/choose-a-plan';
const runtime=globalThis.ThemePortableSections;
const sku='SKU-STOCK-ONB-PLAN';
function stockFixture(){
 const f=createSiteOwnedFixture(), db=f.db;
 db.exec(`
 CREATE TABLE cms_definitions(
  id TEXT PRIMARY KEY,account_id TEXT NOT NULL,definition_key TEXT NOT NULL,
  kind TEXT NOT NULL,label TEXT NOT NULL,description TEXT,category TEXT,origin TEXT,
  version TEXT NOT NULL,status TEXT NOT NULL,settings_schema_json TEXT NOT NULL,
  allowed_blocks_json TEXT NOT NULL,max_blocks INTEGER,metadata_json TEXT NOT NULL);
 CREATE TABLE cms_components(
  id TEXT PRIMARY KEY,definition_id TEXT NOT NULL,renderer_key TEXT NOT NULL,
  implementation_status TEXT NOT NULL,delivery_mode TEXT NOT NULL,source_ref TEXT,
  package_ref TEXT,artifact_r2_bucket TEXT,artifact_r2_key TEXT,artifact_sha256 TEXT);
 CREATE TABLE cms_component_templates(
  id TEXT PRIMARY KEY,sku TEXT UNIQUE NOT NULL,template_name TEXT,template_type TEXT,
  category TEXT,label TEXT,status TEXT,tags TEXT,template_data TEXT,is_system INTEGER,
  r2_key TEXT,source_html_r2_key TEXT,usage_count INTEGER,is_featured INTEGER,
  featured_collection TEXT,item_type TEXT,definition_id TEXT,definition_key TEXT,
  definition_version TEXT,editor_schema_json TEXT,compatibility_json TEXT,
  responsive_schema_json TEXT,data_bindings_json TEXT,preview_json TEXT,sort_order INTEGER);
 `);
 db.prepare(`INSERT INTO cms_definitions VALUES
   ('def-plan','platform',?,'section','Plan selection','Actual native stock','Commerce',
    'built_in','1','active','{}','["plan"]',6,'{}')`).run(id);
 db.prepare(`INSERT INTO cms_components
 (id,definition_id,renderer_key,implementation_status,delivery_mode,source_ref)
 VALUES ('cmp-plan','def-plan',?,'verified','bundled','portable-sections.js')`).run(id);
 const defaults=runtime.defaults(id), schema=runtime.schema(id);
 assert.equal(runtime.validate(id,defaults).ok,true);
 db.prepare(`INSERT INTO cms_component_templates (
  id,sku,template_name,template_type,category,label,status,tags,template_data,
  is_system,r2_key,source_html_r2_key,usage_count,is_featured,featured_collection,
  item_type,definition_id,definition_key,definition_version,editor_schema_json,
  compatibility_json,responsive_schema_json,data_bindings_json,preview_json,sort_order)
 VALUES ('template-plan',?,'Plan selection','section','Commerce','Plan selection',
 'active','[]',?,1,'cms/stock/plan.json',NULL,0,0,NULL,'section','def-plan',?,'1',
 ?,'{}','{}','{}','{}',10)`)
 .run(sku,JSON.stringify({renderer_key:id,default_content:defaults}),id,
  JSON.stringify({fields:schema.fields,blocks:schema.blocks}));
 return f;
}
const resource='https://cms.test/api/admin/cms/pages/home/catalog-resources?site_id=main&page_id=home';
const invoke=(env,account,method,body,target=resource)=>{
 const url=new URL(target);
 return handleAdminCmsApi(new Request(url,{method,...(body?{headers:{'content-type':'application/json'},
  body:JSON.stringify(body)}:{})}),env,url,{accountId:account});
};
test('existing canonical stock template installs all native blocks, immutable draft and ownership references',async()=>{
 const {db,env,objects}=stockFixture();
 try{
  const listed=await invoke(env,'merchant','GET');
  assert.equal(listed.status,200);
  const data=await listed.json();
  const item=data.catalog.find(row=>row.sku===sku);
  assert.ok(item,'stock catalog must be discoverable');
  assert.equal(item.installable,true);
  const install=await invoke(env,'merchant','POST',{catalogKey:sku,toIndex:0});
  const result=await install.json();
  assert.equal(install.status,201,JSON.stringify(result));
  assert.equal(result.ok,true);
  assert.equal(result.template_sku,sku);
  const row=db.prepare('SELECT page_id,template_sku,definition_id,draft_r2_key,published_r2_key,section_type FROM cms_page_sections WHERE id=?')
    .get(result.section_id);
  assert.equal(row.page_id,'home');
  assert.equal(row.template_sku,sku);
  assert.equal(row.definition_id,'def-plan');
  assert.equal(row.section_type,'theme_section');
  assert.equal(row.published_r2_key,null);
  assert.ok(objects.has(row.draft_r2_key));
  const blocks=db.prepare('SELECT block_key,block_type,sort_order,account_id FROM cms_section_blocks WHERE section_id=? ORDER BY sort_order')
    .all(result.section_id);
  assert.equal(blocks.length,runtime.defaults(id).__editor.blocks.length);
  assert.deepEqual(blocks.map(x=>x.block_key),runtime.defaults(id).__editor.blocks.map(x=>x.id));
  assert.ok(blocks.every(x=>x.account_id==='merchant'));
  const page=(await getSiteOwnedPage(env,'merchant','home','main','home')).page;
  assert.ok(page.sections.some(section=>section.key===result.section_key &&
    section.content.__editor.catalogSku===sku));
  const loaded=await invoke(env,'merchant','GET');
  const installed=(await loaded.json()).installed;
  assert.ok(installed.some(x=>x.section_key===result.section_key && x.template_sku===sku));
  assert.equal(db.prepare("SELECT status FROM cms_pages WHERE id='home'").get().status,'published');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM cms_revisions WHERE entity_id=?").get(result.section_id).n,1);
  const foreign=await invoke(env,'other','POST',{catalogKey:sku},resource);
  assert.equal(foreign.status,404);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_page_sections').get().n,2);
 }finally{db.close();}
});
test('catalog rejects forged fields, unsafe destinations, and foreign page IDs without changing published state',async()=>{
 const {db,env}=stockFixture();
 try {
  for(const config of [{__editor:{themePreset:'forged'}},{title:'Safe',badField:'oops'},{
    plan1:{href:'javascript:alert(1)'}
  }]){
   const response=await invoke(env,'merchant','POST',{catalogKey:sku,settings:config});
   assert.equal(response.status,422,JSON.stringify(await response.json()));
  }
  const cross=new URL(resource);cross.searchParams.set('page_id','otherhome');
  const result=await invoke(env,'merchant','POST',{catalogKey:sku},cross);
  assert.equal(result.status,404);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_page_sections').get().n,1);
  assert.equal(db.prepare("SELECT status FROM cms_pages WHERE id='home'").get().status,'published');
 }finally{db.close();}
});

test('merchant block edits, reorders and additions persist atomically with the section revision',async()=>{
 const {db,env,objects}=stockFixture();
 try{
  const created=await invoke(env,'merchant','POST',{catalogKey:sku});
  const section=await created.json();
  assert.equal(created.status,201,JSON.stringify(section));
  const initial=db.prepare('SELECT id,block_key FROM cms_section_blocks WHERE section_id=?')
    .all(section.section_id);
  const initialIds=new Map(initial.map(row=>[row.block_key,row.id]));
  const content=structuredClone(section.instance.settings);
  content.title='Merchant edited plans';
  content.plan1.title='Starter';
  delete content.plan2;
  content.plan3={title:'Enterprise',detail:'Custom assistance',price:'Request a quote',
    linkText:'Contact sales',href:'/contact'};
  content.__editor.blocks=[
    {id:'plan3',templateKey:'plan',enabled:true},
    {id:'plan1',templateKey:'plan',enabled:true},
  ];
  const saveUrl='https://cms.test/api/admin/cms/pages/home/sections/'+section.section_key+'?site_id=main&page_id=home';
  const saved=await invoke(env,'merchant','PUT',{content,expected_version:1},saveUrl);
  assert.equal(saved.status,200,JSON.stringify(await saved.json()));
  const blocks=db.prepare('SELECT id,block_key,sort_order,status,content_json FROM cms_section_blocks WHERE section_id=? ORDER BY sort_order')
    .all(section.section_id);
  const editable=blocks.filter(row=>row.status!=='archived');
  assert.deepEqual(editable.map(row=>row.block_key),['plan3','plan1']);
  assert.equal(blocks.find(row=>row.block_key==='plan2').status,'archived');
  assert.equal(blocks.find(row=>row.block_key==='plan1').id,initialIds.get('plan1'));
  assert.equal(JSON.parse(editable[1].content_json).title,'Starter');
  const reopen=(await getSiteOwnedPage(env,'merchant','home','main','home')).page;
  const current=reopen.sections.find(row=>row.key===section.section_key);
  assert.equal(current.version,2);
  assert.equal(current.content.title,'Merchant edited plans');
  assert.deepEqual(current.content.__editor.blocks.map(x=>x.id),['plan3','plan1']);
  const persisted=db.prepare('SELECT draft_r2_key,published_r2_key FROM cms_page_sections WHERE id=?')
    .get(section.section_id);
  assert.ok(objects.has(persisted.draft_r2_key));
  assert.equal(persisted.published_r2_key,null);
  const stale=await invoke(env,'merchant','PUT',{content:{...content,title:'Stale writer'},
    expected_version:1},saveUrl);
  assert.equal(stale.status,409);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_revisions WHERE entity_id=?').get(section.section_id).n,2);
  assert.equal((await getSiteOwnedPage(env,'merchant','home','main','home')).page.sections.find(
    row=>row.key===section.section_key).content.title,'Merchant edited plans');
 }finally{db.close();}
});

test('native CMS stock sections are identical in private preview and immutable published page manifest',async()=>{
 const {db,env,objects}=stockFixture();
 const publishedObjects=new Map();
 try{
  // This page is authored from installed stock; keep the legacy source section
  // for the separate fail-closed publication regression below.
  db.exec("DELETE FROM cms_page_sections WHERE id='hero'");
  db.exec(`
    CREATE TABLE cms_page_drafts(page_id TEXT,user_id TEXT,draft_data TEXT NOT NULL,
      UNIQUE(page_id,user_id));
    CREATE TABLE cms_publications(account_id TEXT NOT NULL,site_id TEXT NOT NULL,
      release_number INTEGER NOT NULL,status TEXT NOT NULL,
      manifest_object_key TEXT NOT NULL,manifest_hash TEXT NOT NULL,
      source_revision_hash TEXT,created_by TEXT,metadata_json TEXT,published_at TEXT,
      UNIQUE(site_id,release_number));
  `);
  db.prepare('INSERT INTO cms_page_drafts VALUES (?,?,?)').run('home','merchant',JSON.stringify({
    title:'Store Home',url_handle:'home',visibility:'visible',body_html:'',
    seo_title:'Store Home',seo_description:'Welcome to the store'
  }));
  env.WEBSITE_ASSETS={
    async get(key){return publishedObjects.has(key)?
      {text:async()=>publishedObjects.get(key)}:null;},
    async put(key,value){publishedObjects.set(key,String(value));}
  };
  const inserted=await (await invoke(env,'merchant','POST',{catalogKey:sku})).json();
  const preview=await previewMerchantPage(env,'merchant','main','home','home');
  assert.equal(preview.ok,true,JSON.stringify(preview));
  assert.match(preview.html,/Compare options/);
  assert.match(preview.html,/data-portable-preset="platform\/choose-a-plan"/);
  assert.match(preview.html,/ps-section/);
  assert.match(preview.html,/\.ps-section\s*\{/);
  assert.equal((preview.html.match(/data-cms-block="/g)||[]).length,2);
  const released=await publishMerchantPage(env,'merchant','main','home','home');
  assert.equal(released.ok,true,JSON.stringify(released));
  assert.equal(released.rendered_sections,1);
  assert.equal(released.release_number,1);
  assert.equal(publishedObjects.get(released.key),preview.html);
  const manifest=JSON.parse(publishedObjects.get(released.manifest_key));
  assert.equal(manifest.schema,'agentsam.cms-page-publication.v1');
  assert.equal(manifest.sections[0].template_sku,sku);
  assert.equal(manifest.sections[0].rendered,true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_publications WHERE site_id=?').get('main').n,1);
  assert.equal(db.prepare('SELECT published_manifest_object_key key FROM cms_pages WHERE id=?').get('home').key,released.manifest_key);
  assert.equal(db.prepare('SELECT published_r2_key key FROM cms_page_sections WHERE id=?')
    .get(inserted.section_id).key,db.prepare('SELECT draft_r2_key key FROM cms_page_sections WHERE id=?')
    .get(inserted.section_id).key);

  const editing=structuredClone(inserted.instance.settings);
  editing.title='Merchant published after revision';
  editing.plan1.title='Updated plan';
  const saveUrl='https://cms.test/api/admin/cms/pages/home/sections/'+inserted.section_key+'?site_id=main&page_id=home';
  const edit=await invoke(env,'merchant','PUT',{content:editing,expected_version:1},saveUrl);
  assert.equal(edit.status,200,JSON.stringify(await edit.json()));
  const next=await publishMerchantPage(env,'merchant','main','home','home');
  assert.equal(next.ok,true,JSON.stringify(next));
  assert.equal(next.release_number,2);
  assert.notEqual(next.manifest_key,released.manifest_key);
  assert.equal(db.prepare('SELECT published_r2_key key FROM cms_page_sections WHERE id=?')
    .get(inserted.section_id).key,db.prepare('SELECT draft_r2_key key FROM cms_page_sections WHERE id=?')
    .get(inserted.section_id).key);
  assert.match(publishedObjects.get(next.key),/Merchant published after revision/);
  assert.match(publishedObjects.get(released.key),/Compare options/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_publications WHERE site_id=?').get('main').n,2);
  const denied=await publishMerchantPage(env,'other','main','home','home');
  assert.equal(denied.ok,false);
 }finally{db.close();}
});
test('publishing a live page with an unverified section fails closed and never drops its content',async()=>{
 const {db,env}=stockFixture();
 const published=new Map();
 try{
  db.exec(`
    CREATE TABLE cms_page_drafts(page_id TEXT,user_id TEXT,draft_data TEXT NOT NULL, UNIQUE(page_id,user_id));
    CREATE TABLE cms_publications(account_id TEXT NOT NULL,site_id TEXT NOT NULL,
      release_number INTEGER NOT NULL,status TEXT NOT NULL,manifest_object_key TEXT NOT NULL,
      manifest_hash TEXT NOT NULL,source_revision_hash TEXT,created_by TEXT,
      metadata_json TEXT,published_at TEXT,UNIQUE(site_id,release_number));
  `);
  db.prepare('INSERT INTO cms_page_drafts VALUES (?,?,?)').run('home','merchant',JSON.stringify({
    title:'Home',url_handle:'home',visibility:'visible',body_html:'<p>Body</p>'
  }));
  env.WEBSITE_ASSETS={async get(key){return published.has(key)?
    {text:async()=>published.get(key)}:null;},async put(key,value){published.set(key,String(value));}};
  const preview=await previewMerchantPage(env,'merchant','main','home','home');
  assert.equal(preview.ok,false);
  assert.match(preview.error,/cms_page_section_renderer_unverified/);
  const release=await publishMerchantPage(env,'merchant','main','home','home');
  assert.equal(release.ok,false);
  assert.equal(release.status,409);
  assert.equal(db.prepare('SELECT count(*) n FROM cms_publications').get().n,0);
  assert.equal(db.prepare('SELECT content_object_key FROM cms_pages WHERE id=?').get('home').content_object_key,null);
 }finally{db.close();}
});

test('concurrent section edit during release cannot publish a stale page or partial site receipt',async()=>{
 const {db,env}=stockFixture();
 try {
  db.exec("DELETE FROM cms_page_sections WHERE id='hero'");
  db.exec(`
    CREATE TABLE cms_page_drafts(page_id TEXT,user_id TEXT,draft_data TEXT NOT NULL,
      UNIQUE(page_id,user_id));
    CREATE TABLE cms_publications(account_id TEXT NOT NULL,site_id TEXT NOT NULL,
      release_number INTEGER NOT NULL,status TEXT NOT NULL,
      manifest_object_key TEXT NOT NULL,manifest_hash TEXT NOT NULL,
      source_revision_hash TEXT,created_by TEXT,metadata_json TEXT,published_at TEXT,
      UNIQUE(site_id,release_number));
  `);
  db.prepare('INSERT INTO cms_page_drafts VALUES (?,?,?)').run('home','merchant',JSON.stringify({
    title:'Home',url_handle:'home',visibility:'visible',body_html:''
  }));
  const installed=await (await invoke(env,'merchant','POST',{catalogKey:sku})).json();
  const artifacts=new Map();
  let raced=false;
  env.WEBSITE_ASSETS={
    async get(key){return artifacts.has(key)?{text:async()=>artifacts.get(key)}:null;},
    async put(key,value) {
      artifacts.set(key,String(value));
      if(!raced && key.endsWith('.html')){
        raced=true;
        db.prepare("UPDATE cms_page_sections SET content_hash='concurrent-write' WHERE id=?")
          .run(installed.section_id);
      }
    }
  };
  const attempted=await publishMerchantPage(env,'merchant','main','home','home');
  assert.equal(attempted.ok,false);
  assert.equal(attempted.status,409,JSON.stringify(attempted));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM cms_publications").get().n,0);
  assert.equal(db.prepare("SELECT content_object_key key FROM cms_pages WHERE id='home'").get().key,null);
  assert.equal(db.prepare("SELECT published_r2_key key FROM cms_page_sections WHERE id=?")
    .get(installed.section_id).key,null);
 }finally{db.close();}
});


test('site-owned store chat install and save enforce manifest-owned settings and identity', async()=>{
 const {db,env}=stockFixture();
 try {
  const missing=await invoke(env,'merchant','POST',{catalogKey:'store_chat'});
  assert.equal(missing.status,409);
  const app=loadEmbedCatalog().apps.find(a=>a.key==='store_chat');
  const hash=text=>createHash('sha256').update(text).digest('hex');
  const source='customElements.define("agentsam-store-chat",class extends HTMLElement{})';
  const sha=hash(source), objectKey='blobs/sha256/'+sha.slice(0,2)+'/'+sha;
  const manifestKey='packages/platform/store-chat/1.0.0-preview.1/manifest.json';
  const manifest=JSON.stringify({schema:'inneranimalmedia.cms-component-package.v2',embed_key:'store_chat',renderer_key:'agentsam-embeds:store-chat',element:'agentsam-store-chat',entrypoint:'chat-widget.js',files:[{path:'chat-widget.js',sha256:sha,bytes:Buffer.byteLength(source),content_type:'text/javascript',object_key:objectKey}]});
  db.prepare("INSERT INTO cms_definitions VALUES ('def-chat','merchant','store_chat','component','Online store chat','','Customer Service','package','1.0.0','draft','{}','[]',0,?)").run(JSON.stringify({element:'agentsam-store-chat',owner_only_fields:['agent_replies','endpoint']}));
  db.prepare("INSERT INTO cms_components VALUES ('cmp-chat','def-chat','agentsam-embeds:store-chat','unverified','isolated_embed','chat-widget.js',NULL,'theme-store',?,?)").run(manifestKey,hash(manifest));
  db.prepare("INSERT INTO cms_component_templates(id,sku,template_name,status,template_data,item_type,definition_id,definition_key,definition_version,editor_schema_json) VALUES ('tpl-chat','SKU-EMB-STORE-CHAT','Online store chat','draft',?,'ui_component','def-chat','store_chat','1.0.0',?)").run(JSON.stringify(app.default_config),JSON.stringify({fields:app.editor_fields}));
  const assets=new Map([[manifestKey,manifest],[objectKey,source]]);
  env.EMBED_ARTIFACT_FETCH=async url=>{const raw=assets.get(new URL(url).pathname.slice(1));return new Response(raw||'',{status:raw?200:404});};
  const list=await (await invoke(env,'merchant','GET')).json();
  assert.equal(list.registered_embeds[0].registration.definitionId,'def-chat');
  const previewUrl=resource.replace('catalog-resources?','catalog-resources/store_chat/preview?');
  const preview=await invoke(env,'merchant','GET',undefined,previewUrl);
  assert.equal(preview.status,200);assert.equal((await preview.json()).source,source);
  assets.set(objectKey,'corrupt');
  const corrupt=await invoke(env,'merchant','POST',{catalogKey:'store_chat'});
  assert.equal(corrupt.status,503);
  assets.set(objectKey,source);
  const invalid=await invoke(env,'merchant','POST',{catalogKey:'store_chat',settings:{accent:'not-a-color'}});
  assert.equal(invalid.status,422);
  const installed=await invoke(env,'merchant','POST',{catalogKey:'store_chat',settings:{enabled:true,greeting:'Welcome',agent_replies:'auto',endpoint:'/arbitrary'}});
  const result=await installed.json(); assert.equal(installed.status,201,JSON.stringify(result));
  assert.match(result.section_key,/^store-chat-[0-9a-f]{8}$/);
  assert.equal(db.prepare('SELECT definition_id FROM cms_page_sections WHERE id=?').get(result.section_id).definition_id,'def-chat');
  assert.equal(db.prepare('SELECT template_sku FROM cms_page_sections WHERE id=?').get(result.section_id).template_sku,'SKU-EMB-STORE-CHAT');
  assert.equal(result.instance.settings.agent_replies,'draft'); assert.equal(result.instance.settings.endpoint,'');
  const target='https://cms.test/api/admin/cms/pages/home/sections/'+result.section_key+'?site_id=main&page_id=home';
  const bad=await invoke(env,'merchant','PUT',{content:{...result.instance.settings,__editor:{catalogKey:'form_inline'}}},target);
  assert.equal(bad.status,422);
  const saved=await invoke(env,'merchant','PUT',{content:{...result.instance.settings,greeting:'Updated',agent_replies:'auto',endpoint:'/arbitrary'}},target);
  assert.equal(saved.status,200,JSON.stringify(await saved.clone().json()));
  const page=(await getSiteOwnedPage(env,'merchant','home','main','home')).page;
  const content=page.sections.find(section=>section.key===result.section_key).content;
  assert.equal(content.greeting,'Updated'); assert.equal(content.agent_replies,'draft'); assert.equal(content.endpoint,'');
  assert.equal(content['embed-root'].greeting,'Updated');
 } finally {db.close();}
});
