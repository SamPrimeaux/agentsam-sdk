import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleStudioNewTabPreferences} from './studio-user-preferences.js';

function fixture() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec([
    'CREATE TABLE accounts(id TEXT PRIMARY KEY)',
    'CREATE TABLE agentsam_user_ui_preferences(account_id TEXT PRIMARY KEY REFERENCES accounts(id),ui_preferences_json TEXT NOT NULL DEFAULT "{}" CHECK(json_valid(ui_preferences_json)),updated_at INTEGER NOT NULL DEFAULT (unixepoch()))',
    "INSERT INTO accounts VALUES('alice'),('bob')",
  ].join(';')+';');
  sqlite.prepare('INSERT INTO agentsam_user_ui_preferences(account_id,ui_preferences_json) VALUES (?,?)')
    .run('alice',JSON.stringify({settings_general:{openLastProject:true},inneranimal_companions:{activeId:'geaux'}}));
  const db={prepare(sql){const statement=sqlite.prepare(sql);return {bind(...args){return {
    first:async()=>statement.get(...args),
    run:async()=>({meta:{changes:Number(statement.run(...args).changes)}}),
  };}};}};
  return {db,sqlite};
}
const request=(method='GET',body,origin='https://host.example')=>new Request('https://host.example/api/settings/new-tab',{
  method,...(method==='GET'?{}:{headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}),
});

test('wallpaper selection persists to existing account UI preference row without clobbering other keys',async()=>{
  const {db,sqlite}=fixture();
  const input={wallpaper:'forest',imageUrl:null};
  const update=await handleStudioNewTabPreferences(request('PUT',input),{DB:db},'alice');
  assert.equal(update.status,200);
  const data=await update.json();
  assert.deepEqual(data.appearance,input);
  const stored=JSON.parse(sqlite.prepare("SELECT ui_preferences_json FROM agentsam_user_ui_preferences WHERE account_id='alice'").get().ui_preferences_json);
  assert.equal(stored.new_tab.wallpaper,'forest');
  assert.equal(stored.settings_general.openLastProject,true);
  assert.equal(stored.inneranimal_companions.activeId,'geaux');
  const bob=await (await handleStudioNewTabPreferences(request(),{DB:db},'bob')).json();
  assert.equal(bob.appearance.wallpaper,'default');
  const alice=await (await handleStudioNewTabPreferences(request(),{DB:db},'alice')).json();
  assert.equal(alice.appearance.wallpaper,'forest');
});

test('wallpaper photo settings validate URLs, origin and ownership',async()=>{
  const {db}=fixture();
  for(const imageUrl of ['javascript:alert(1)','http://insecure.test/a.png','//evil.example/a.png','/media/../private','https://example.test/"><script>']){
    const response=await handleStudioNewTabPreferences(request('PUT',{wallpaper:'photo',imageUrl}),{DB:db},'alice');
    assert.equal(response.status,400,imageUrl);
  }
  const photo=await handleStudioNewTabPreferences(request('PUT',{wallpaper:'photo',imageUrl:'/media/library/photo.png'}),{DB:db},'alice');
  assert.equal(photo.status,200);
  const external=await handleStudioNewTabPreferences(request('PUT',{wallpaper:'photo',imageUrl:'https://images.example.org/photo.jpg'}),{DB:db},'alice');
  assert.equal(external.status,200);
  assert.equal((await handleStudioNewTabPreferences(request('PUT',{wallpaper:'dusk',imageUrl:null},'https://evil.example'),{DB:db},'alice')).status,403);
  assert.equal((await handleStudioNewTabPreferences(request('PUT',{wallpaper:'dusk',imageUrl:null}),{DB:db},null)).status,401);
  assert.equal((await handleStudioNewTabPreferences(request('PUT',{wallpaper:'script',imageUrl:null}),{DB:db},'alice')).status,400);
});
