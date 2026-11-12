import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  listAccountSideStages, updateAccountSideStage, projectSideStageContribution,
  readAccountSideStageCatalog,
} from './plugin-side-stages.js';

const pluginId='plg_1234567890abcdef';
const otherId='plg_aaaaaaaaaaaaaaaa';
const metadata=JSON.stringify({side_stage:{version:1,id:'files',tab_kind:'files',renderer:'builtin',icon:'file-code'}});
function fixture() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE agentsam_plugins(id TEXT PRIMARY KEY,plugin_key TEXT,family_key TEXT,plugin_kind TEXT,display_name TEXT,description TEXT,icon_url TEXT,metadata_json TEXT,sort_priority INTEGER);');
  sqlite.exec('CREATE TABLE agentsam_plugin_installations(account_id TEXT,plugin_id TEXT,instance_key TEXT,enabled INTEGER,setup_status TEXT,health_status TEXT,composer_visible INTEGER,settings_visible INTEGER,updated_at INTEGER, UNIQUE(account_id,plugin_id,instance_key));');
  sqlite.prepare('INSERT INTO agentsam_plugins VALUES (?,?,?,?,?,?,?,?,?)')
    .run(pluginId,'agentsam-stage-files','core','native','Files','Real file explorer',null,metadata,10);
  sqlite.prepare('INSERT INTO agentsam_plugins VALUES (?,?,?,?,?,?,?,?,?)')
    .run(otherId,'unrelated-plugin','connections','oauth','Other','No access',null,metadata,20);
  const db={prepare(sql){
    const statement=sqlite.prepare(sql);
    let values=[];
    const wrapper={
      bind(...args){values=args;return wrapper;},
      first:async()=>statement.get(...values)||null,
      all:async()=>({results:statement.all(...values)}),
      run:async()=>statement.run(...values),
    };
    return wrapper;
  }};
  return {sqlite,db};
}
test('account preference hides native panels without uninstalling or affecting other accounts',async()=>{
  const {sqlite,db}=fixture();
  try {
    assert.deepEqual((await listAccountSideStages(db,'alice')).map(x=>x.label),['Files']);
    assert.deepEqual((await listAccountSideStages(db,'bob')).map(x=>x.label),['Files']);
    assert.equal((await updateAccountSideStage(db,'alice',pluginId,false)).enabled,false);
    assert.deepEqual(await listAccountSideStages(db,'alice'),[]);
    assert.equal((await listAccountSideStages(db,'alice',{includeDisabled:true}))[0].enabled,false);
    assert.equal((await listAccountSideStages(db,'bob'))[0].enabled,true);
    assert.equal(sqlite.prepare('SELECT count(*) count FROM agentsam_plugin_installations WHERE account_id=?').get('alice').count,1);
    await updateAccountSideStage(db,'alice',pluginId,true);
    assert.equal((await listAccountSideStages(db,'alice'))[0].enabled,true);
  } finally {sqlite.close();}
});
test('no other plugin can impersonate a builtin panel',async()=>{
  const {sqlite,db}=fixture();
  try {
    await assert.rejects(updateAccountSideStage(db,'alice',otherId,false),/side_stage_not_found/);
    await assert.rejects(updateAccountSideStage(db,'alice','plg_fake',false),/side_stage_plugin_invalid/);
    await assert.rejects(updateAccountSideStage(db,'alice',pluginId,'false'),/side_stage_enabled_required/);
    await assert.rejects(updateAccountSideStage(db,'',pluginId,false),/side_stage_account_required/);
    const nonCore=projectSideStageContribution({
      id:otherId,plugin_key:'unrelated-plugin',family_key:'connections',plugin_kind:'oauth',
      display_name:'Other',metadata_json:metadata,
    });
    assert.equal(nonCore,null);
  } finally {sqlite.close();}
});

test('isolated read lists disabled panels without requiring provider probes',async()=>{
  const {sqlite,db}=fixture();
  try {
    const enabled=await readAccountSideStageCatalog(db,'alice');
    assert.equal(enabled.ok,true);
    assert.deepEqual(enabled.side_stage_catalog.map(x=>x.label),['Files']);
    await updateAccountSideStage(db,'alice',pluginId,false);
    const disabled=await readAccountSideStageCatalog(db,'alice');
    assert.equal(disabled.side_stage_catalog[0].enabled,false);
    assert.equal((await readAccountSideStageCatalog(db,'bob')).side_stage_catalog[0].enabled,true);
    await assert.rejects(readAccountSideStageCatalog(null,'alice'),/side_stage_database_unavailable/);
    await assert.rejects(readAccountSideStageCatalog(db,''),/side_stage_account_required/);
  } finally { sqlite.close(); }
});

test('installed first-party design app exposes a user-controlled Side Stage embed without cross-account leakage',async()=>{
  const {sqlite,db}=fixture();
  try {
    const id='plg_bbbbbbbbbbbbbbbb';
    const metadata=JSON.stringify({
      source:'https://agentsam.inneranimalmedia.com/catalog/plugins',
      app:{surfaces:['admin-nav','add-apps'],nav:{href:'/design-canvas/'}},
      side_stage:{version:1,id:'design-canvas',renderer:'embed',href:'https://agentsam.inneranimalmedia.com/design-canvas/'}
    });
    sqlite.prepare('INSERT INTO agentsam_plugins VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id,'agentsam-design-canvas','apps','native','Design Canvas','Source-backed design',null,metadata,66);
    assert.deepEqual((await listAccountSideStages(db,'alice')).map(x=>x.id),['agentsam-stage-files']);
    sqlite.prepare('INSERT INTO agentsam_plugin_installations (account_id,plugin_id,instance_key,enabled,setup_status) VALUES (?,?,?,?,?)')
      .run('alice',id,'default',1,'configured');
    sqlite.prepare('INSERT INTO agentsam_plugin_installations (account_id,plugin_id,instance_key,enabled,setup_status) VALUES (?,?,?,?,?)')
      .run('alice',id,'side-stage-v1',1,'configured');
    const alice=await listAccountSideStages(db,'alice');
    const app=alice.find(x=>x.id==='agentsam-design-canvas');
    assert.equal(app.renderer,'embed');
    assert.equal(app.href,'https://agentsam.inneranimalmedia.com/design-canvas/');
    assert.equal((await listAccountSideStages(db,'bob')).some(x=>x.id==='agentsam-design-canvas'),false);
    await updateAccountSideStage(db,'alice',id,false);
    assert.equal((await listAccountSideStages(db,'alice')).some(x=>x.id==='agentsam-design-canvas'),false);
    assert.equal(sqlite.prepare("SELECT enabled FROM agentsam_plugin_installations WHERE account_id='alice' AND plugin_id=? AND instance_key='default'").get(id).enabled,1);
    await updateAccountSideStage(db,'alice',id,true);
    assert.equal((await listAccountSideStages(db,'alice')).some(x=>x.id==='agentsam-design-canvas'),true);
    sqlite.prepare("UPDATE agentsam_plugin_installations SET enabled=0 WHERE account_id='alice' AND plugin_id=? AND instance_key='default'").run(id);
    assert.equal((await listAccountSideStages(db,'alice')).some(x=>x.id==='agentsam-design-canvas'),false);
  }finally{sqlite.close();}
});
