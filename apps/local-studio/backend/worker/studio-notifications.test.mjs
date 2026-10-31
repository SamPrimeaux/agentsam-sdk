import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleStudioNotifications } from './studio-notifications.js';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec("CREATE TABLE notifications(id TEXT,recipient_id TEXT,recipient_type TEXT,subject TEXT,message TEXT,channel TEXT,status TEXT,read_at INTEGER,created_at INTEGER)");
  const insert=sqlite.prepare("INSERT INTO notifications VALUES(?,?,?,'Update',?,'in_app','pending',NULL,?)");
  insert.run('own-old','account-a','user','Old',1);
  insert.run('own-new','account-a','user','New',3);
  insert.run('other','account-b','user','Private other account',4);
  insert.run('company','account-a','company','Company scoped',5);
  return {sqlite,env:{DB:{prepare(sql){return {bind(...values){return {all:async()=>({results:sqlite.prepare(sql).all(...values)})};}};}}}};
}
test('real SQL scopes history to the verified user, ignores client identity, orders and bounds results',async()=>{
  const {sqlite,env}=database();
  try {
    const response=await handleStudioNotifications(new Request('https://studio.test/api/settings/notifications?user_id=account-b&limit=1'),env,'account-a');
    assert.equal(response.status,200);
    assert.match(response.headers.get('cache-control'),/no-store/);
    const body=await response.json();
    assert.deepEqual(body.notifications.map(item=>item.id),['own-new']);
    assert.equal(body.notifications[0].message,'New');
    assert.equal('recipient_id' in body.notifications[0],false);
    const all=await handleStudioNotifications(new Request('https://studio.test/api/settings/notifications?limit=9999'),env,'account-a');
    assert.deepEqual((await all.json()).notifications.map(item=>item.id),['own-new','own-old']);
    const empty=await handleStudioNotifications(new Request('https://studio.test/api/settings/notifications'),env,'account-c');
    assert.deepEqual((await empty.json()).notifications,[]);
  } finally {sqlite.close();}
});
test('unauthenticated callers cannot read or probe the database',async()=>{
  const response=await handleStudioNotifications(new Request('https://studio.test/api/settings/notifications'),{DB:{prepare(){throw Error('must not execute');}}},null);
  assert.equal(response.status,401);
});
test('feed is read-only and unavailable storage is an honest retryable error',async()=>{
  const response=await handleStudioNotifications(new Request('https://studio.test/api/settings/notifications',{method:'POST'}),{},'account-a');
  assert.equal(response.status,405); assert.equal(response.headers.get('allow'),'GET');
  for(const env of [{},{DB:{prepare(){throw Error('private database details');}}}]) {
    const unavailable=await handleStudioNotifications(new Request('https://studio.test/api/settings/notifications'),env,'account-a');
    assert.equal(unavailable.status,503);
    assert.deepEqual(await unavailable.json(),{ok:false,error:'notifications_unavailable',retryable:true});
  }
});
