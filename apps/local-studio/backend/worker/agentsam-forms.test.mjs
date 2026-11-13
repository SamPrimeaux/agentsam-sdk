import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { FORM_STARTERS, normalizeFormDocument, handleAgentSamFormsApi,
  handleAgentSamFormsPublic } from './agentsam-forms.js';
import { installNativeAdminApp, setNativeAdminAppEnabled } from './apps-launcher.js';

const site='https://agentsam.inneranimalmedia.com';
const migrationPath=resolve(dirname(fileURLToPath(import.meta.url)),
  '../migrations/1365_agentsamforms_cms_site_and_submissions.sql');
const migration=readFileSync(migrationPath,'utf8');
function call(path,{method='GET',data,origin=site}={}){
  return new Request(site+path,{method,headers:{origin,...(data===undefined?{}:{'content-type':'application/json'})},
    ...(data===undefined?{}:{body:JSON.stringify(data)})});
}
const body=res=>res.json();
function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE accounts (id TEXT PRIMARY KEY);
    CREATE TABLE cms_sites (
      id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',primary_domain TEXT,is_default INTEGER NOT NULL DEFAULT 0,
      UNIQUE(id,account_id)
    );
    CREATE TABLE apps (
      id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT,description TEXT,category TEXT,
      status TEXT NOT NULL,featured INTEGER,created_at INTEGER,updated_at INTEGER,
      app_type TEXT,visibility TEXT,launch_url TEXT,editor_url TEXT,
      capabilities_json TEXT,config_json TEXT
    );
    CREATE TABLE agentsam_app_installations (
      id TEXT PRIMARY KEY DEFAULT ('ainst_' || lower(hex(randomblob(8)))),
      account_id TEXT NOT NULL,app_id TEXT NOT NULL REFERENCES apps(id),
      enabled INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL DEFAULT(unixepoch()),
      UNIQUE(account_id,app_id)
    );
    CREATE TABLE cms_globals (
      id TEXT PRIMARY KEY DEFAULT ('cmsg_' || lower(hex(randomblob(8)))),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      site_id TEXT NOT NULL,global_key TEXT NOT NULL,global_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',inline_content_json TEXT NOT NULL DEFAULT '{}',
      content_version INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT(datetime('now')),
      updated_at TEXT NOT NULL DEFAULT(datetime('now')),
      UNIQUE(site_id,global_key),
      FOREIGN KEY(site_id,account_id) REFERENCES cms_sites(id,account_id) ON DELETE CASCADE
    );
    CREATE TABLE cms_revisions (
      id TEXT PRIMARY KEY DEFAULT ('cmsr_' || lower(hex(randomblob(8)))),
      account_id TEXT NOT NULL REFERENCES accounts(id),site_id TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('page','section','block','global')),
      entity_id TEXT NOT NULL,revision_number INTEGER NOT NULL DEFAULT 0,
      revision_kind TEXT NOT NULL DEFAULT 'current',
      content_object_key TEXT,content_hash TEXT,snapshot_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT(datetime('now')),
      UNIQUE(site_id,entity_type,entity_id,revision_number,revision_kind,content_object_key),
      FOREIGN KEY(site_id,account_id) REFERENCES cms_sites(id,account_id) ON DELETE CASCADE
    );
    INSERT INTO accounts(id) VALUES('alice'),('bob');
    INSERT INTO cms_sites(id,account_id,name,status,is_default) VALUES
     ('shop-a','alice','Alice Shop','active',1),
     ('shop-a-2','alice','Alice Second Shop','active',0),
     ('shop-draft','alice','Alice Draft','draft',0),
     ('shop-b','bob','Bob Shop','active',1);
  `);
  // Execute the exact checked-in D1 migration against an actual SQLite schema.
  sqlite.exec(migration);
  const db={prepare(sql){return {bind(...values){
    const stmt=sqlite.prepare(sql);
    return {
      first:async()=>stmt.get(...values)||null,
      all:async()=>({results:stmt.all(...values)}),
      run:async()=>{const result=stmt.run(...values);return {
        meta:{changes:result.changes,last_row_id:Number(result.lastInsertRowid)}
      };},
    };
  }};}};
  return {sqlite,db};
}
async function install(db,accountId){return installNativeAdminApp(db,accountId,'agentsamforms');}
async function bootstrap(db,accountId,siteId){
  return handleAgentSamFormsApi(call('/api/forms/bootstrap?site='+siteId,{method:'POST'}),{DB:db},accountId);
}

test('migration uses canonical Apps and CMS, only adds operational response storage',()=>{
  const {sqlite}=fixture();
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM apps WHERE id='agentsamforms'").get().n,1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='cms_form_submissions'").get().n,1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='agentsam_forms'").get().n,0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='agentsam_form_submissions'").get().n,0);
  assert.equal(sqlite.prepare("PRAGMA foreign_key_check").all().length,0);
  sqlite.close();
});
test('five native starter documents are valid and have actionable controls',()=>{
  assert.equal(FORM_STARTERS.length,5);
  assert.equal(new Set(FORM_STARTERS.map(f=>f.key)).size,5);
  for (const preset of FORM_STARTERS) {
    const d=normalizeFormDocument(preset.document);
    assert.ok(d.fields.length>=3);
    assert.ok(d.fields.some(f=>f.required));
    assert.ok(d.fields.every(f=>f.key && f.label));
  }
  assert.equal(FORM_STARTERS.find(x=>x.key==='newsletter-signup').document.fields.find(f=>f.key==='consent').required,true);
  const invalid=structuredClone(FORM_STARTERS[0].document);
  invalid.fields[1].key=invalid.fields[0].key;
  assert.throws(()=>normalizeFormDocument(invalid),/field_key_invalid/);
});
test('unauthenticated, uninstalled and cross-account owners are excluded',async()=>{
  const {sqlite,db}=fixture();
  assert.equal((await body(await handleAgentSamFormsApi(call('/api/forms'),{DB:db},null))).error,'unauthorized');
  const response=await body(await handleAgentSamFormsApi(call('/api/forms'),{DB:db},'alice'));
  assert.equal(response.installed,false);
  assert.equal(response.forms.length,0);
  assert.equal(response.sites.length,3);
  assert.equal((await bootstrap(db,'alice','shop-a')).status,403);
  await install(db,'alice');
  assert.equal((await bootstrap(db,'bob','shop-b')).status,403);
  assert.equal((await bootstrap(db,'alice','shop-b')).status,404);
  assert.equal((await bootstrap(db,'alice','missing')).status,404);
  sqlite.close();
});
test('install is canonical, five CMS site forms seed once and remain isolated',async()=>{
  const {sqlite,db}=fixture();
  await install(db,'alice');
  assert.equal((await install(db,'alice')).enabled,true);
  const first=await body(await bootstrap(db,'alice','shop-a'));
  assert.equal(first.forms.length,5);
  assert.ok(first.forms.every(x=>x.site_id==='shop-a' && x.status==='draft'));
  assert.ok(first.forms.every(x=>/^cmsg_[a-f0-9]{16}$/.test(x.id)));
  assert.equal((await body(await bootstrap(db,'alice','shop-a'))).forms.length,5);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM cms_globals WHERE global_type='form'").get().n,5);
  assert.equal((await body(await handleAgentSamFormsApi(call('/api/forms?site=shop-a-2'),{DB:db},'alice'))).forms.length,0);
  assert.equal((await body(await handleAgentSamFormsApi(call('/api/forms?site=shop-b'),{DB:db},'alice'))).error,'site_not_found');
  await install(db,'bob');
  assert.equal((await body(await bootstrap(db,'bob','shop-b'))).forms.length,5);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM cms_globals WHERE global_type='form'").get().n,10);
  sqlite.close();
});
test('draft edit, optimistic version, publish, public submit, owner inbox, unpublish',async()=>{
  const {sqlite,db}=fixture();
  await install(db,'alice');
  const starter=await body(await bootstrap(db,'alice','shop-a'));
  const row=starter.forms.find(x=>x.key==='newsletter-signup');
  const id=row.id;
  assert.equal((await handleAgentSamFormsPublic(call('/forms/embed/'+id),{DB:db})).status,404);
  const detail=await body(await handleAgentSamFormsApi(call('/api/forms/'+id),{DB:db},'alice'));
  const doc=detail.form.document;
  doc.title='Join our updates';
  let r=await handleAgentSamFormsApi(call('/api/forms/'+id,{method:'PUT',data:{version:1,document:doc}}),{DB:db},'alice');
  assert.equal(r.status,200);
  assert.equal((await body(r)).form.version,2);
  assert.equal((await handleAgentSamFormsApi(call('/api/forms/'+id,{method:'PUT',data:{version:1,document:doc}}),{DB:db},'alice')).status,409);
  assert.equal((await handleAgentSamFormsApi(call('/api/forms/'+id,{method:'GET'}),{DB:db},'bob')).status,403);
  r=await handleAgentSamFormsApi(call('/api/forms/'+id+'/test',{method:'POST',
    data:{name:'Pat',email:'pat@example.com',consent:true}}),{DB:db},'alice');
  assert.equal(r.status,201);
  r=await handleAgentSamFormsApi(call('/api/forms/'+id+'/publish',{method:'POST'}),{DB:db},'alice');
  assert.equal(r.status,200);
  assert.equal((await handleAgentSamFormsPublic(call('/forms/embed/'+id),{DB:db})).status,200);
  assert.equal((await handleAgentSamFormsApi(call('/api/forms/'+id,{method:'PUT',data:{version:2,document:doc}}),{DB:db},'alice')).status,409);
  const data=new URLSearchParams({name:'Taylor',email:'taylor@example.com',consent:'on'});
  r=await handleAgentSamFormsPublic(new Request(site+'/api/forms/public/'+id,{method:'POST',
    headers:{origin:site,'content-type':'application/x-www-form-urlencoded'},body:data}),{DB:db});
  assert.equal(r.status,200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM cms_form_submissions WHERE account_id=? AND site_id=?').get('alice','shop-a').n,2);
  const inbox=await body(await handleAgentSamFormsApi(call('/api/forms/'+id+'/submissions'),{DB:db},'alice'));
  assert.equal(inbox.submissions.length,2);
  assert.deepEqual(inbox.submissions.map(x=>x.is_test).sort(),[false,true]);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM cms_revisions WHERE entity_id=?').get(id).n,2);
  assert.equal((await handleAgentSamFormsApi(call('/api/forms/'+id+'/unpublish',{method:'POST'}),{DB:db},'alice')).status,200);
  assert.equal((await handleAgentSamFormsPublic(call('/forms/embed/'+id),{DB:db})).status,404);
  sqlite.close();
});
test('disable, draft site and forged account/site submissions fail closed',async()=>{
  const {sqlite,db}=fixture();
  await install(db,'alice');
  const r=await body(await bootstrap(db,'alice','shop-draft'));
  const id=r.forms[0].id;
  assert.equal((await handleAgentSamFormsApi(call('/api/forms/'+id+'/publish',{method:'POST'}),{DB:db},'alice')).status,200);
  assert.equal((await handleAgentSamFormsPublic(call('/forms/embed/'+id),{DB:db})).status,404);
  assert.throws(()=>sqlite.prepare(
    "INSERT INTO cms_form_submissions(account_id,site_id,form_id,payload_json) VALUES ('bob','shop-b',?,'{}')"
  ).run(id),/cms_form_scope_mismatch/);
  await setNativeAdminAppEnabled(db,'alice','agentsamforms',false);
  assert.equal((await handleAgentSamFormsApi(call('/api/forms/'+id),{DB:db},'alice')).status,403);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM cms_globals WHERE id=?').get(id).n,1);
  sqlite.close();
});
