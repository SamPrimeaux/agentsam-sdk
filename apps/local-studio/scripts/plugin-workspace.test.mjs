import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readPluginWorkspace} from '../backend/worker/plugin-workspace.js';

function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE agentsam_plugins(
  id TEXT,account_id TEXT,installation_key TEXT,setup_status TEXT,
  is_enabled INTEGER,plugin_key TEXT,endpoint_url TEXT
 );
 CREATE TABLE agentsam_tools(
  id TEXT,account_id TEXT,plugin_id TEXT,tool_key TEXT,handler_config TEXT,
  is_active INTEGER,sort_priority INTEGER
 );`);
 sqlite.prepare("INSERT INTO agentsam_plugins VALUES (?,?,?,?,?,?,?)")
   .run('plg_brand','au_owner','catalog-v1','connected',1,'agentsam-brand',
    'https://plugins.inneranimalmedia.com/mcp/brand');
 const env={DB:{prepare(sql){
   const stmt=sqlite.prepare(sql);let args=[];
   const bound={
     bind(...v){args=v;return bound},
     first(){return stmt.get(...args)||null},
     all(){return {results:stmt.all(...args)}},
   };return bound;
 }}};
 return {sqlite,env};
}
test('workspace requires plugin installation ownership',async()=>{
 const {env}=fixture();
 await assert.rejects(readPluginWorkspace(env,'au_other','plg_brand'),
   /plugin_installation_not_found/);
 await assert.rejects(readPluginWorkspace(env,'au_owner','plg_fake'),
   /plugin_installation_not_found/);
});
test('workspace cannot fetch chat history or execute unregistered context tools',async()=>{
 const {env,sqlite}=fixture();
 await assert.rejects(readPluginWorkspace(env,'au_owner','plg_brand'),
   /plugin_workspace_context_tool_unavailable/);
 sqlite.prepare("UPDATE agentsam_plugins SET is_enabled=0").run();
 await assert.rejects(readPluginWorkspace(env,'au_owner','plg_brand'),
   /plugin_workspace_not_connected/);
});
