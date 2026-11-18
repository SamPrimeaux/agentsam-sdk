import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import '../packages/theme-contract/runtime/portable-sections.js';
import {listCmsComponentCatalog} from '../backend/cms/definition-registry.mjs';
const sql=readFileSync(new URL('../../local-studio/backend/migrations/1378_merchant_native_verified_sections.sql',import.meta.url),'utf8');
const runtime=globalThis.ThemePortableSections;
function dbFixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`
 PRAGMA foreign_keys=ON;
 CREATE TABLE accounts(id TEXT PRIMARY KEY);
 CREATE TABLE cms_definitions(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),
 definition_key TEXT NOT NULL,kind TEXT NOT NULL,label TEXT NOT NULL,description TEXT,category TEXT,
 origin TEXT NOT NULL,version TEXT NOT NULL DEFAULT '1',settings_schema_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(settings_schema_json)),
 allowed_blocks_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(allowed_blocks_json)),max_blocks INTEGER,
 metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),status TEXT NOT NULL DEFAULT 'active',
 UNIQUE(account_id,kind,definition_key,version));
 CREATE TABLE cms_components(id TEXT PRIMARY KEY,definition_id TEXT NOT NULL UNIQUE REFERENCES cms_definitions(id),
 renderer_key TEXT NOT NULL,delivery_mode TEXT NOT NULL,package_ref TEXT,source_ref TEXT,
 artifact_r2_bucket TEXT,artifact_r2_key TEXT,artifact_sha256 TEXT,
 capabilities_json TEXT NOT NULL DEFAULT '{}',compatibility_json TEXT NOT NULL DEFAULT '{}',
 verification_json TEXT NOT NULL DEFAULT '{}',implementation_status TEXT NOT NULL);
 CREATE TABLE cms_component_templates(id TEXT DEFAULT (lower(hex(randomblob(16)))),sku TEXT PRIMARY KEY,
 template_name TEXT NOT NULL,template_type TEXT NOT NULL,category TEXT NOT NULL,label TEXT,item_type TEXT,
 status TEXT NOT NULL DEFAULT 'active',is_system INTEGER DEFAULT 1,r2_bucket TEXT,r2_key TEXT,
 source_html_r2_key TEXT,slug TEXT,definition_id TEXT REFERENCES cms_definitions(id),
 definition_key TEXT,definition_version TEXT,template_data TEXT NOT NULL DEFAULT '{}',
 editor_schema_json TEXT NOT NULL DEFAULT '{}',compatibility_json TEXT NOT NULL DEFAULT '{}',
 responsive_schema_json TEXT NOT NULL DEFAULT '{}',data_bindings_json TEXT NOT NULL DEFAULT '{}',
 preview_json TEXT NOT NULL DEFAULT '{}',tags TEXT NOT NULL DEFAULT '[]',
 sort_order INTEGER DEFAULT 50,usage_count INTEGER DEFAULT 0,is_featured INTEGER DEFAULT 0,featured_collection TEXT);
 INSERT INTO accounts(id) VALUES('acct-platform'),('acct-user1'),('acct-user2');
 INSERT INTO cms_definitions(id,account_id,definition_key,kind,label,origin,version)
 VALUES('cmsd_store_global_header','acct-platform','theme-store-global-header','section','Header','built_in','1');
 `);
 return db;
}
test('six real bundled components register idempotently with exact editor schemas and defaults',()=>{
 const db=dbFixture();try{
  db.exec(sql);db.exec(sql);
  const rows=db.prepare(`SELECT d.account_id,d.definition_key,t.editor_schema_json,t.template_data,c.renderer_key,
    c.implementation_status,c.source_ref FROM cms_definitions d
    JOIN cms_components c ON c.definition_id=d.id
    JOIN cms_component_templates t ON t.definition_id=d.id WHERE d.id LIKE 'cmsd_native_%'`).all();
  assert.equal(rows.length,6);
  for(const row of rows){
   assert.equal(row.account_id,'acct-platform');
   assert.equal(row.renderer_key,row.definition_key);
   assert.equal(row.implementation_status,'verified');
   assert.match(row.source_ref,/portable-sections\.js$/);
   assert.ok(runtime.get(row.renderer_key));
   const defaults=runtime.defaults(row.renderer_key);
   assert.equal(runtime.validate(row.renderer_key,defaults).ok,true);
   assert.match(runtime.render({key:'installed',content:defaults}),/data-portable-preset=/);
   const editor=JSON.parse(row.editor_schema_json), actual=runtime.schema(row.renderer_key);
   assert.deepEqual(editor.fields,actual.fields);
   assert.deepEqual(editor.blocks,actual.blocks);
   assert.deepEqual(JSON.parse(row.template_data).default_content,defaults);
  }
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});
test('two merchants discover shared stock without duplicated tenant-owned definitions',async()=>{
 const db=dbFixture();try{
  db.exec(sql);
  const env={DB:{prepare(q){let values=[];return {
   bind(...args){values=args;return this;},
   async all(){return {results:db.prepare(q).all(...values)};}
  };}}};
  for(const account of ['acct-user1','acct-user2']){
   const catalog=await listCmsComponentCatalog(env,account);
   const native=catalog.filter(item=>item.sku?.startsWith('SKU-NATIVE-REV-'));
   assert.equal(native.length,6);
   assert.ok(native.every(item=>item.installable && item.rendererVerified && item.runtimeReady));
   assert.equal(db.prepare('SELECT count(*) n FROM cms_definitions WHERE account_id=?').get(account).n,0);
  }
 }finally{db.close();}
});
