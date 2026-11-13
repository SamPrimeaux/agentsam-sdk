import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import '../../../apps/ecommerce-cms-agentsam/packages/theme-contract/runtime/platform-stock-sections.js';
import {listCmsComponentCatalog} from '../../../apps/ecommerce-cms-agentsam/backend/cms/definition-registry.mjs';

const src=new URL('../backend/migrations/1363_onboarding_stock_six.sql',import.meta.url);
const sql=readFileSync(src,'utf8');
const catalog=JSON.parse(readFileSync(new URL('../../../apps/design-canvas/public/sources/stock/catalog.json',import.meta.url),'utf8'));
const slugs=['choose-a-plan','start-trial-checkout','setup-goals','workspace-setup','first-run-home','style-spec-bw'];
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;');
 db.exec(`
 CREATE TABLE accounts(id TEXT PRIMARY KEY);
 CREATE TABLE cms_definitions(
  id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),
  definition_key TEXT NOT NULL,kind TEXT NOT NULL,label TEXT NOT NULL,description TEXT,category TEXT,origin TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1',settings_schema_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(settings_schema_json)),
  allowed_blocks_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(allowed_blocks_json)),
  max_blocks INTEGER,metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
  status TEXT NOT NULL DEFAULT 'active',UNIQUE(account_id,kind,definition_key,version)
 );
 CREATE TABLE cms_components(
  id TEXT PRIMARY KEY,definition_id TEXT NOT NULL UNIQUE REFERENCES cms_definitions(id),
  renderer_key TEXT NOT NULL,delivery_mode TEXT NOT NULL DEFAULT 'bundled',
  source_ref TEXT,preview_r2_bucket TEXT,preview_r2_key TEXT,capabilities_json TEXT NOT NULL DEFAULT '{}',
  compatibility_json TEXT NOT NULL DEFAULT '{}',verification_json TEXT NOT NULL DEFAULT '{}',
  implementation_status TEXT NOT NULL DEFAULT 'unverified'
 );
 CREATE TABLE cms_component_templates(
  id TEXT DEFAULT (lower(hex(randomblob(16)))),sku TEXT PRIMARY KEY,
  template_name TEXT NOT NULL,template_type TEXT NOT NULL,
  category TEXT NOT NULL,label TEXT,item_type TEXT,status TEXT NOT NULL DEFAULT 'active',
  is_system INTEGER DEFAULT 1,r2_bucket TEXT,r2_key TEXT,source_html_r2_key TEXT,slug TEXT,
  definition_id TEXT REFERENCES cms_definitions(id),definition_key TEXT,definition_version TEXT,
  template_data TEXT NOT NULL DEFAULT '{}',editor_schema_json TEXT NOT NULL DEFAULT '{}',
  compatibility_json TEXT NOT NULL DEFAULT '{}',responsive_schema_json TEXT NOT NULL DEFAULT '{}',
  data_bindings_json TEXT NOT NULL DEFAULT '{}',preview_json TEXT NOT NULL DEFAULT '{}',
  tags TEXT NOT NULL DEFAULT '[]',sort_order INTEGER DEFAULT 50,usage_count INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,featured_collection TEXT
 );
 INSERT INTO accounts(id) VALUES ('acct-platform'),('acct-other');
 INSERT INTO cms_definitions(id,account_id,definition_key,kind,label,origin) VALUES
 ('cmsd_store_global_header','acct-platform','theme-store-global-header','section','Header','built_in');
 `);
 return db;
}
test('all six onboarding stock records are real native renderers, source-backed and idempotent',()=>{
 const db=setup();
 try{
  db.exec(sql);
  db.exec(sql);
  const defs=db.prepare("SELECT * FROM cms_definitions WHERE definition_key LIKE 'platform/%'").all();
  const comps=db.prepare("SELECT * FROM cms_components").all();
  const templates=db.prepare("SELECT * FROM cms_component_templates").all();
  assert.equal(defs.length,6);
  assert.equal(comps.length,6);
  assert.equal(templates.length,6);
  for(const slug of slugs){
   const id='platform/'+slug;
   const source=catalog.items.find(x=>x.slug===slug);
   const definition=defs.find(x=>x.definition_key===id);
   assert.ok(definition);
   assert.equal(definition.account_id,'acct-platform');
   const c=comps.find(x=>x.definition_id===definition.id);
   assert.ok(c);
   assert.equal(c.renderer_key,id);
   assert.equal(c.implementation_status,'verified');
   assert.equal(c.delivery_mode,'bundled');
   assert.equal(c.preview_r2_bucket,'theme-store');
   assert.equal(c.preview_r2_key,source.files.find(f=>f.path===source.main_html).r2_key);
   assert.equal(JSON.parse(c.verification_json).no_payment_processing,true);
   assert.ok(globalThis.ThemePlatformStock.get(id),'native runtime missing '+id);
   const template=templates.find(x=>x.definition_id===definition.id);
   assert.equal(template.item_type,'section');
   assert.equal(template.r2_bucket,'theme-store');
   assert.equal(template.r2_key,c.preview_r2_key);
   assert.equal(JSON.parse(template.template_data).renderer_key,id);
   assert.equal(JSON.parse(template.editor_schema_json).fields.length,
    globalThis.ThemePlatformStock.schema(id).fields.length);
  }
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});

test('native system components are installable for another account without copying the platform definitions',async()=>{
 const db=setup();
 try{
  db.exec(sql);
  const env={DB:{prepare(sql){let params=[];return {
   bind(...args){params=args;return this;},
   async all(){return {results:db.prepare(sql).all(...params)};}
  };}}};
  const catalog=await listCmsComponentCatalog(env,'acct-other');
  const stock=catalog.filter(row=>row.definitionKey?.startsWith('platform/'));
  assert.equal(stock.length,6,'All six system stock entries remain discoverable');
  assert.ok(stock.every(row=>row.installable===true),'All builtin native stocks are installable');
  assert.ok(stock.every(row=>row.definition?.origin==='built_in'));
  assert.ok(stock.every(row=>row.rendererKey?.startsWith('platform/')));
  assert.equal(db.prepare("SELECT count(*) n FROM cms_definitions WHERE account_id='acct-other'").get().n,0,
    'Offering platform components never creates duplicate account-owned system definitions');
 }finally{db.close();}
});
