import test from 'node:test';
import assert from 'node:assert/strict';
import {createSiteOwnedFixture} from './fixtures/site-owned-cms.mjs';
import {handleAdminCmsApi} from '../backend/cms/api.js';
import {getSiteOwnedPage} from '../backend/cms/site-owned-page-adapter.mjs';
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
