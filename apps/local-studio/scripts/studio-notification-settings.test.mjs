import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {handleStudioNotificationSettings} from '../backend/worker/studio-notification-settings.js';

const base='https://agentsam.inneranimalmedia.com/api/settings/notifications';

function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      email TEXT,
      notification_email TEXT,
      meta_json TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  sqlite.prepare(
    `INSERT INTO accounts(id,email,notification_email,meta_json) VALUES (?,?,?,?)`,
  ).run('au_owner','login@example.com',null,JSON.stringify({theme:'dark'}));
  return {sqlite,env:{DB:{prepare(sql){
    const stmt=sqlite.prepare(sql);let args=[];
    const bound={bind(...items){args=items;return bound},
      first(){return stmt.get(...args)||null},
      run(){const x=stmt.run(...args);return {meta:{changes:x.changes}}}};
    return bound;
  }}}};
}

const req=(env,account,method='GET',body,origin)=>handleStudioNotificationSettings(
  new Request(base,{method,headers:{"content-type":"application/json",...(origin?{origin}:{})},
    body:body===undefined?undefined:JSON.stringify(body)}),env,account);

const validBody={
  email:'notify@example.com',
  phone:'+1 337 555 0199',
  channels:{email:true,push:false,imessage:true,in_app:true},
  events:[
    {id:'notify-runs',enabled:true},
    {id:'notify-security',enabled:false},
    {id:'notify-release',enabled:true},
  ],
};

test('notification contact and prefs persist on accounts.id',async()=>{
  const {sqlite,env}=fixture();
  const put=await req(env,'au_owner','PUT',validBody);
  assert.equal(put.status,200);
  const body=await put.json();
  assert.equal(body.settings.email,'notify@example.com');
  assert.equal(body.settings.phone,'+1 337 555 0199');
  assert.equal(body.settings.loginEmail,'login@example.com');
  assert.equal(body.settings.channels.imessage,true);
  assert.equal(body.settings.events.find((row)=>row.id==='notify-security').enabled,false);

  const account=sqlite.prepare(
    'SELECT notification_email, meta_json FROM accounts WHERE id=?',
  ).get('au_owner');
  assert.equal(account.notification_email,'notify@example.com');
  const meta=JSON.parse(account.meta_json);
  assert.equal(meta.theme,'dark');
  assert.equal(meta.notifications.phone,'+1 337 555 0199');
  assert.equal(meta.notifications.channels.imessage,true);
  assert.equal(meta.notification_phone,undefined);

  assert.equal((await req(env,'au_missing')).status,404);

  const get=await (await req(env,'au_owner')).json();
  assert.equal(get.settings.email,'notify@example.com');
  assert.equal(get.settings.events.find((row)=>row.id==='notify-release').enabled,true);
});

test('clearing phone removes it from accounts.meta_json.notifications',async()=>{
  const {sqlite,env}=fixture();
  await req(env,'au_owner','PUT',validBody);
  await req(env,'au_owner','PUT',{...validBody,phone:'',channels:{...validBody.channels,imessage:false}});
  const meta=JSON.parse(sqlite.prepare(
    'SELECT meta_json FROM accounts WHERE id=?',
  ).get('au_owner').meta_json);
  assert.equal(meta.theme,'dark');
  assert.equal(meta.notifications.phone,'');
  assert.equal(meta.notifications.channels.imessage,false);
});

test('rejects cross-origin mutations, invalid payloads, and missing session',async()=>{
  const {env}=fixture();
  assert.equal((await req(env,'au_owner','PUT',validBody,'https://evil.test')).status,403);
  assert.equal((await req(env,'au_owner','PUT',{...validBody,email:'not-an-email'})).status,400);
  assert.equal((await req(env,'au_owner','PUT',{...validBody,events:[{id:'notify-runs',enabled:'yes'}]})).status,400);
  assert.equal((await req(env,null)).status,401);
});
