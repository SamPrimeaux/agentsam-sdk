import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {installNativeAdminApp,removeNativeAdminApp,setNativeAdminAppEnabled} from './apps-launcher.js';

function fixture() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE agentsam_plugins(id TEXT PRIMARY KEY,plugin_key TEXT UNIQUE,plugin_kind TEXT,metadata_json TEXT);
    CREATE TABLE agentsam_plugin_installations(id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),account_id TEXT,plugin_id TEXT,instance_key TEXT,enabled INTEGER,setup_status TEXT,health_status TEXT,composer_visible INTEGER,settings_visible INTEGER,updated_at INTEGER,UNIQUE(account_id,plugin_id,instance_key));`);
  const app=JSON.stringify({app:{surfaces:['admin-nav','side-stage'],nav:{href:'/cad',label:'CAD Creator'}}});
  sqlite.prepare('INSERT INTO agentsam_plugins VALUES(?,?,?,?)').run('plg_cad','agentsam-stage-cad','native',app);
  sqlite.prepare('INSERT INTO agentsam_plugins VALUES(?,?,?,?)').run('plg_mcp','not-an-app','mcp',app);
  const db={prepare(sql){const stmt=sqlite.prepare(sql);return {bind(...args){return {
    first:async()=>stmt.get(...args), all:async()=>({results:stmt.all(...args)}),run:async()=>stmt.run(...args),
  };}};}};
  return {sqlite,db};
}
test('app install, disable, enable and remove are scoped to one account and one instance',async()=>{
  const {db,sqlite}=fixture();
  await installNativeAdminApp(db,'alice','agentsam-stage-cad');
  await installNativeAdminApp(db,'bob','agentsam-stage-cad');
  sqlite.prepare("INSERT INTO agentsam_plugin_installations(account_id,plugin_id,instance_key,enabled,setup_status) VALUES ('alice','plg_cad','side-stage-v1',1,'configured')").run();
  assert.equal((await setNativeAdminAppEnabled(db,'alice','agentsam-stage-cad',false)).enabled,false);
  assert.equal(sqlite.prepare("SELECT setup_status FROM agentsam_plugin_installations WHERE account_id='alice' AND instance_key='default'").get().setup_status,'disabled');
  assert.equal(sqlite.prepare("SELECT enabled FROM agentsam_plugin_installations WHERE account_id='bob' AND instance_key='default'").get().enabled,1);
  assert.equal(sqlite.prepare("SELECT enabled FROM agentsam_plugin_installations WHERE account_id='alice' AND instance_key='side-stage-v1'").get().enabled,1);
  assert.equal((await setNativeAdminAppEnabled(db,'alice','agentsam-stage-cad',true)).enabled,true);
  assert.equal(sqlite.prepare("SELECT setup_status FROM agentsam_plugin_installations WHERE account_id='alice' AND instance_key='default'").get().setup_status,'configured');
  const removed=await removeNativeAdminApp(db,'alice','agentsam-stage-cad');
  assert.equal(removed.removed,true);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM agentsam_plugin_installations WHERE account_id='alice'").get().n,1);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM agentsam_plugin_installations WHERE account_id='bob'").get().n,1);
  assert.equal((await removeNativeAdminApp(db,'alice','agentsam-stage-cad')).removed,false);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM agentsam_plugins').get().n,2);
});
test('only native manifest-declared admin apps can be modified',async()=>{
  const {db}=fixture();
  await assert.rejects(()=>removeNativeAdminApp(db,'alice','not-an-app'),/app_install_not_supported/);
  await assert.rejects(()=>setNativeAdminAppEnabled(db,'alice','agentsam-stage-cad',true),/app_not_installed/);
  await assert.rejects(()=>removeNativeAdminApp(db,'alice','../bad'),/app_install_key_invalid/);
  await assert.rejects(()=>removeNativeAdminApp(db,'','agentsam-stage-cad'),/apps_launcher_context_missing/);
  await assert.rejects(()=>setNativeAdminAppEnabled(db,'alice','agentsam-stage-cad','true'),/app_enabled_invalid/);
});
