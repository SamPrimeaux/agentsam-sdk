import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {installFirstPartyEntertainment,removeFirstPartyEntertainment} from './first-party-entertainment.js';
import {listAccountSideStages,updateAccountSideStage} from './plugin-side-stages.js';

const key='inneranimalmedia-wizard-chess-3d';
const id='plg_1234567890abcdef';
const meta=JSON.stringify({
  source:'https://inneranimalmedia.com',
  app:{surfaces:['add-apps','side-stage']},
  side_stage:{version:1,id:'wizard-chess-3d',renderer:'embed',
    href:'https://inneranimalmedia.com/games/wizard-chess-v3/',icon:'box'},
});
function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec("CREATE TABLE agentsam_plugins(id TEXT PRIMARY KEY,plugin_key TEXT,provider_key TEXT,plugin_kind TEXT,category TEXT,transport TEXT,auth_type TEXT,family_key TEXT,display_name TEXT,description TEXT,icon_url TEXT,metadata_json TEXT,sort_priority INTEGER)");
  sqlite.exec("CREATE TABLE agentsam_plugin_installations(account_id TEXT,plugin_id TEXT,instance_key TEXT,enabled INTEGER,setup_status TEXT,health_status TEXT,composer_visible INTEGER,settings_visible INTEGER,updated_at INTEGER,UNIQUE(account_id,plugin_id,instance_key))");
  sqlite.exec("CREATE TABLE agentsam_tools(plugin_key TEXT,account_id TEXT)");
  sqlite.prepare("INSERT INTO agentsam_plugins VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id,key,'inneranimalmedia','native','entertainment','native','none','build',
      'Wizard Chess 3D','Premium online and offline 3D chess',null,meta,75);
  const db={prepare(sql){
    const stmt=sqlite.prepare(sql);
    let params=[];
    const bound={
      bind(...args){params=args;return bound;},
      first:async()=>stmt.get(...params)||null,
      all:async()=>({results:stmt.all(...params)}),
      run:async()=>stmt.run(...params),
    };
    return bound;
  }};
  return {sqlite,db};
}
test('first-party entertainment installs only for the requesting account and creates a playable Side Stage',async()=>{
  const {sqlite,db}=fixture();
  try{
    await assert.rejects(installFirstPartyEntertainment({DB:db},'alice','other-plugin'),/plugin_catalog_entry_not_found/);
    const installed=await installFirstPartyEntertainment({DB:db},'alice',key);
    assert.equal(installed.status,'installed');
    assert.equal((await listAccountSideStages(db,'alice'))[0].href,'https://inneranimalmedia.com/games/wizard-chess-v3/');
    assert.equal((await listAccountSideStages(db,'bob')).length,0);
    const count=sqlite.prepare('SELECT COUNT(*) n FROM agentsam_plugin_installations WHERE account_id=?').get('alice').n;
    assert.equal(count,2);
    await updateAccountSideStage(db,'alice',id,false);
    await installFirstPartyEntertainment({DB:db},'alice',key);
    assert.equal((await listAccountSideStages(db,'alice')).length,0,'reinstall must not override disabled Stage preference');
    assert.equal((await listAccountSideStages(db,'alice',{includeDisabled:true}))[0].enabled,false);
    assert.equal((await removeFirstPartyEntertainment({DB:db},'alice',id)).removed,true);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM agentsam_plugin_installations WHERE account_id=?').get('alice').n,0);
    assert.equal((await listAccountSideStages(db,'alice')).length,0);
  }finally{sqlite.close();}
});
test('first-party installer rejects manipulated provider definitions and cannot mint hardware authority',async()=>{
  const {sqlite,db}=fixture();
  try{
    sqlite.prepare('UPDATE agentsam_plugins SET provider_key=? WHERE id=?').run('someone-else',id);
    await assert.rejects(installFirstPartyEntertainment({DB:db},'alice',key),/plugin_catalog_entry_not_found/);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM agentsam_plugin_installations').get().n,0);
  }finally{sqlite.close();}
});
