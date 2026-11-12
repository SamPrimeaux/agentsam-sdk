import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

const migration=new URL('../migrations/1359_native_app_accounts_and_canvas.sql',import.meta.url);

test('legacy app backfill preserves account installs while Canvas remains independent',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE accounts(id TEXT PRIMARY KEY);
    CREATE TABLE agentsam_plugins(id TEXT PRIMARY KEY,plugin_key TEXT UNIQUE,plugin_kind TEXT,metadata_json TEXT,updated_at INTEGER);
    CREATE TABLE agentsam_plugin_installations(id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),account_id TEXT,plugin_id TEXT,instance_key TEXT,enabled INTEGER,setup_status TEXT,health_status TEXT,composer_visible INTEGER,settings_visible INTEGER,UNIQUE(account_id,plugin_id,instance_key));`);
  for(const account of ['a','b'])db.prepare('INSERT INTO accounts(id) VALUES (?)').run(account);
  for(const key of ['agentsam-stage-cad','agentsam-stage-media','agentsam-app-samsketch','agentsam-app-growth','agentsam-stage-canvas','agentsam-campaign'])
    db.prepare('INSERT INTO agentsam_plugins(id,plugin_key,plugin_kind,metadata_json) VALUES(?,?,?,?)')
      .run('plg_'+key,key,key==='agentsam-campaign'?'mcp':'native',key==='agentsam-campaign'?JSON.stringify({app:{nav:{href:'/campaigns'}},source:'trusted'}):JSON.stringify({side_stage:{id:key}}));
  db.prepare("INSERT INTO agentsam_plugin_installations(account_id,plugin_id,instance_key,enabled,setup_status) VALUES ('a','plg_agentsam-stage-media','default',0,'disabled')").run();
  db.prepare("INSERT INTO agentsam_plugin_installations(account_id,plugin_id,instance_key,enabled,setup_status) VALUES ('a','plg_agentsam-stage-canvas','side-stage-v1',1,'configured')").run();
  const sql=readFileSync(migration,'utf8');
  db.exec(sql);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agentsam_plugin_installations WHERE instance_key='default'").get().n,10);
  assert.equal(db.prepare("SELECT enabled FROM agentsam_plugin_installations WHERE account_id='a' AND plugin_id='plg_agentsam-stage-media' AND instance_key='default'").get().enabled,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agentsam_plugin_installations WHERE plugin_id='plg_agentsam-stage-canvas'").get().n,3);
  assert.equal(db.prepare("SELECT json_extract(metadata_json,'$.app.nav.href') AS href FROM agentsam_plugins WHERE plugin_key='agentsam-stage-canvas'").get().href,'/canvas');
  assert.equal(db.prepare("SELECT json_extract(metadata_json,'$.app') AS app FROM agentsam_plugins WHERE plugin_key='agentsam-campaign'").get().app,null);
  assert.equal(db.prepare("SELECT json_extract(metadata_json,'$.source') AS source FROM agentsam_plugins WHERE plugin_key='agentsam-campaign'").get().source,'trusted');
  db.exec(sql);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agentsam_plugin_installations WHERE instance_key='default'").get().n,10);
});
