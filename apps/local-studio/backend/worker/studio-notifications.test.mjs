import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleStudioNotifications } from './studio-notifications.js';

const path='https://studio.test/api/notifications';
function database() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE notifications(id TEXT PRIMARY KEY,recipient_id TEXT,recipient_type TEXT,subject TEXT,message TEXT,channel TEXT,status TEXT,priority TEXT,data TEXT,read_at INTEGER,created_at INTEGER);`);
  const insert=sqlite.prepare("INSERT INTO notifications VALUES(?,?,?,'Update',?,'in_app','pending',?, ?,NULL,?)");
  insert.run('own-old','account-a','user','Old','normal','{}',1);
  insert.run('own-new','account-a','user','New','high',JSON.stringify({destination:'/agentsam'}),3);
  insert.run('other','account-b','user','Private other account','urgent','{}',4);
  insert.run('company','account-a','company','Company scoped','normal','{}',5);
  return {sqlite,env:{DB:{prepare(sql){const statement=sqlite.prepare(sql);let values=[];const bound={bind(...items){values=items;return bound},all:async()=>({results:statement.all(...values)}),first:async()=>statement.get(...values)||null,run:async()=>({meta:{changes:statement.run(...values).changes}})};return bound;}}}};
}
const call=(env,account,route=path,method='GET',headers={})=>handleStudioNotifications(new Request(route,{method,headers}),env,account);

test('inbox is account-scoped, ordered, limited and includes independent unread count',async()=>{
  const {sqlite,env}=database();try{
    const response=await call(env,'account-a',`${path}?recipient_id=account-b&limit=1`);
    assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
    const body=await response.json();assert.equal(body.unreadCount,2);
    assert.deepEqual(body.notifications.map(n=>n.id),['own-new']);
    assert.equal(body.notifications[0].destination,'/agentsam');
    assert.equal(body.notifications[0].priority,'high');
    assert.equal('recipient_id' in body.notifications[0],false);
    const all=await (await call(env,'account-a',`${path}?limit=500`)).json();
    assert.deepEqual(all.notifications.map(n=>n.id),['own-new','own-old']);
    assert.deepEqual((await (await call(env,'missing')).json()).notifications,[]);
  }finally{sqlite.close();}
});
test('mark one read is idempotent and cannot modify another account',async()=>{
  const {sqlite,env}=database();try{
    const first=await call(env,'account-a',`${path}/own-new/read`,'POST',{origin:'https://studio.test'});
    assert.equal(first.status,200);assert.equal((await first.json()).unreadCount,1);
    assert.equal(sqlite.prepare('SELECT status FROM notifications WHERE id=?').get('own-new').status,'pending');
    assert.ok(sqlite.prepare('SELECT read_at FROM notifications WHERE id=?').get('own-new').read_at);
    assert.equal((await call(env,'account-a',`${path}/own-new/read`,'POST')).status,200);
    assert.equal((await call(env,'account-a',`${path}/other/read`,'POST')).status,404);
    assert.equal(sqlite.prepare('SELECT read_at FROM notifications WHERE id=?').get('other').read_at,null);
  }finally{sqlite.close();}
});
test('read-all only updates caller account and rejects cross-origin writes',async()=>{
  const {sqlite,env}=database();try{
    assert.equal((await call(env,'account-a',`${path}/read-all`,'POST',{origin:'https://evil.test'})).status,403);
    const result=await (await call(env,'account-a',`${path}/read-all`,'POST',{origin:'https://studio.test'})).json();
    assert.deepEqual({updated:result.updated,unreadCount:result.unreadCount},{updated:2,unreadCount:0});
    assert.equal(sqlite.prepare('SELECT read_at FROM notifications WHERE id=?').get('other').read_at,null);
  }finally{sqlite.close();}
});
test('empty credentials, unsupported routes and unavailable DB fail safely',async()=>{
  const {sqlite,env}=database();try{
    assert.equal((await call(env,null)).status,401);
    assert.equal((await call(env,'account-a',`${path}/../other/read`,'POST')).status,404);
    assert.equal((await call(env,'account-a',path,'POST')).status,405);
    assert.equal((await call(env,'account-a',`${path}/read-all`,'GET')).status,405);
    assert.equal((await call({},'account-a')).status,503);
  }finally{sqlite.close();}
});
