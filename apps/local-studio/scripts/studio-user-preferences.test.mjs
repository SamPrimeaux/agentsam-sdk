import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {handleStudioUserPreferences} from '../backend/worker/studio-user-preferences.js';
const base='https://agentsam.inneranimalmedia.com/api/settings/preferences';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE agentsam_user_ui_preferences(
   workspace_id TEXT NOT NULL,user_id TEXT NOT NULL,
   ui_preferences_json TEXT NOT NULL DEFAULT '{}',
   updated_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
   PRIMARY KEY(workspace_id,user_id)
 );`);
 return {sqlite,env:{DB:{prepare(sql){
   const stmt=sqlite.prepare(sql);let args=[];
   const bound={bind(...items){args=items;return bound},
     first(){return stmt.get(...args)||null},
     run(){const x=stmt.run(...args);return {meta:{changes:x.changes}}}};
   return bound;
 }}}};
}
const req=(env,account,method='GET',body,origin)=>handleStudioUserPreferences(
 new Request(base,{method,headers:{"content-type":"application/json",...(origin?{origin}:{})},
 body:body===undefined?undefined:JSON.stringify(body)}),env,account);
test('account settings persist and are not readable by another user',async()=>{
 const {env}=fixture();
 const value={openLastProject:true,showRuntimeReceipts:false};
 assert.equal((await req(env,'au_owner','PUT',value)).status,200);
 assert.deepEqual((await (await req(env,'au_owner')).json()).preferences,value);
 assert.deepEqual((await (await req(env,'au_other')).json()).preferences,
   {openLastProject:false,showRuntimeReceipts:false});
});
test('updates preserve unrelated user UI preferences JSON fields',async()=>{
 const {sqlite,env}=fixture();
 sqlite.prepare('INSERT INTO agentsam_user_ui_preferences(workspace_id,user_id,ui_preferences_json) VALUES (?,?,?)')
  .run('','au_owner',JSON.stringify({editor:{fontSize:13},theme:'dark'}));
 await req(env,'au_owner','PUT',{openLastProject:true,showRuntimeReceipts:true});
 const stored=JSON.parse(sqlite.prepare('SELECT ui_preferences_json FROM agentsam_user_ui_preferences WHERE user_id=?').get('au_owner').ui_preferences_json);
 assert.deepEqual(stored.editor,{fontSize:13});
 assert.equal(stored.theme,'dark');
 assert.deepEqual(stored.settings_general,{openLastProject:true,showRuntimeReceipts:true});
});
test('rejects cross-origin mutations, invalid payloads, and missing session',async()=>{
 const {env}=fixture();
 const value={openLastProject:true,showRuntimeReceipts:false};
 assert.equal((await req(env,'au_owner','PUT',value,'https://evil.test')).status,403);
 assert.equal((await req(env,'au_owner','PUT',{...value,showRuntimeReceipts:'true'})).status,400);
 assert.equal((await req(env,null)).status,401);
});
