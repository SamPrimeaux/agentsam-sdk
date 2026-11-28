import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {listAccountWidgets, installAccountWidget, changeAccountWidget, removeAccountWidget, reorderAccountWidgets, handleAccountWidgetsRequest} from './account-widgets.js';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec([
    'PRAGMA foreign_keys=ON',
    'CREATE TABLE accounts(id TEXT PRIMARY KEY)',
    'CREATE TABLE agentsam_widget_catalog(widget_key TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT,category TEXT NOT NULL,icon_key TEXT,package_name TEXT,component_key TEXT NOT NULL,default_size TEXT NOT NULL DEFAULT "small",supported_sizes_json TEXT NOT NULL,data_adapter_key TEXT,action_adapter_key TEXT,is_enabled INTEGER NOT NULL DEFAULT 1)',
    'CREATE TABLE agentsam_widget_installations(id INTEGER PRIMARY KEY AUTOINCREMENT,account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,widget_key TEXT NOT NULL REFERENCES agentsam_widget_catalog(widget_key) ON DELETE CASCADE,instance_key TEXT NOT NULL DEFAULT "default",surface TEXT NOT NULL DEFAULT "widgets_home",enabled INTEGER NOT NULL DEFAULT 1,pinned INTEGER NOT NULL DEFAULT 0,hidden INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL DEFAULT (unixepoch()),updated_at INTEGER NOT NULL DEFAULT (unixepoch()),UNIQUE(account_id,widget_key,surface,instance_key))',
    'CREATE TABLE agentsam_widget_layouts(id INTEGER PRIMARY KEY AUTOINCREMENT,installation_id TEXT NOT NULL REFERENCES agentsam_widget_installations(id) ON DELETE CASCADE,breakpoint TEXT NOT NULL DEFAULT "base",size_class TEXT NOT NULL DEFAULT "small",order_index INTEGER NOT NULL DEFAULT 0,is_docked INTEGER NOT NULL DEFAULT 0,collapsed INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL DEFAULT (unixepoch()),updated_at INTEGER NOT NULL DEFAULT (unixepoch()),UNIQUE(installation_id,breakpoint))',
    'CREATE TABLE agentsam_widget_preferences(installation_id TEXT PRIMARY KEY REFERENCES agentsam_widget_installations(id) ON DELETE CASCADE,preferences_json TEXT NOT NULL DEFAULT "{}" CHECK(json_valid(preferences_json)),updated_at INTEGER NOT NULL DEFAULT (unixepoch()))',
    "INSERT INTO accounts VALUES ('alice'),('bob')"
  ].join(';')+';');
  const insert = sqlite.prepare('INSERT INTO agentsam_widget_catalog (widget_key,name,category,component_key,default_size,supported_sizes_json,data_adapter_key) VALUES (?,?,?,?,?,?,?)');
  insert.run('countdown','Countdown','utility','CountdownWidget','small','["small","medium"]',null);
  insert.run('clock','Clock','utility','ClockWidget','small','["small","medium"]',null);
  insert.run('queues','Queue Depth','glance','QueueDepthWidget','medium','["medium","large"]','queues.observability');
  insert.run('calculator','Calculator','utility','CalculatorWidget','small','["small","medium"]',null);
  insert.run('pull-request-summary','Pull Request Summary','glance','PullRequestSummaryWidget','medium','["medium","large"]','widget.configuration.snapshot');
  insert.run('release-readiness','Verification','glance','ReleaseReadinessWidget','medium','["medium","large"]','github.commit-readiness');
  insert.run('quick-controls','Quick Controls','utility','quick-controls','small','["small"]',null);
  insert.run('store-chat','Store chat','inbox','agentsam-store-chat','small','["small"]',null);
  const db={prepare(query){const stmt=sqlite.prepare(query); return {bind(...args){return {
    first:async()=>stmt.get(...args),all:async()=>({results:stmt.all(...args)}),
    run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}}),
  };}};}};
  const count=(table)=>sqlite.prepare('SELECT count(*) n FROM '+table).get().n;
  return {sqlite,db,count};
}
const body=key=>({key,surface:'agentsam_stage'});

test('catalog is D1-projected but only compiled Workbench widgets are installable',async()=>{
  const {db}=fixture();
  const widgets=await listAccountWidgets(db,'alice','agentsam_stage');
  assert.equal(widgets.length,7);
  assert.equal(widgets.filter(w=>w.available).length,5);
  assert.equal(widgets.find(w=>w.key==='quick-controls').availability,'concept');
  assert.equal(widgets.find(w=>w.key==='pull-request-summary').available,false);
  assert.equal(widgets.find(w=>w.key==='release-readiness').available,true);
  assert.equal(widgets.some(w=>w.key==='store-chat'),false);
  await assert.rejects(()=>installAccountWidget(db,'alice',body('quick-controls')),/widget_not_ready/);
  await assert.rejects(()=>installAccountWidget(db,'alice',body('pull-request-summary')),/widget_not_ready/);
  await assert.rejects(()=>installAccountWidget(db,'alice',body('store-chat')),/widget_not_found/);
  await db.prepare("UPDATE agentsam_widget_catalog SET data_adapter_key='github.pull-request' WHERE widget_key='pull-request-summary'").run();
  const refreshed=(await listAccountWidgets(db,'alice','agentsam_stage')).find(w=>w.key==='pull-request-summary');
  assert.equal(refreshed.available,true);
  await installAccountWidget(db,'alice',body('pull-request-summary'));
});

test('install is idempotent, account-scoped, and creates a base layout',async()=>{
  const {sqlite,db,count}=fixture();
  await installAccountWidget(db,'alice',body('countdown'));
  await installAccountWidget(db,'alice',body('countdown'));
  await installAccountWidget(db,'bob',body('countdown'));
  assert.equal(count('agentsam_widget_installations'),2);
  assert.equal(count('agentsam_widget_layouts'),2);
  await installAccountWidget(db,'alice',body('clock'));
  const ranks=sqlite.prepare('SELECT l.order_index FROM agentsam_widget_layouts l JOIN agentsam_widget_installations i ON i.id=l.installation_id WHERE i.account_id=? ORDER BY l.order_index').all('alice');
  assert.deepEqual(ranks.map(r=>r.order_index),[0,1]);
});

test('account preferences and layout are independently persisted and validated',async()=>{
  const {db,count}=fixture();
  await installAccountWidget(db,'alice',body('countdown'));
  await installAccountWidget(db,'bob',body('countdown'));
  await changeAccountWidget(db,'alice',{...body('countdown'),pinned:true,sizeClass:'medium',orderIndex:5,configuration:{durationMs:900000}});
  const alice=(await listAccountWidgets(db,'alice','agentsam_stage')).find(w=>w.key==='countdown');
  const bob=(await listAccountWidgets(db,'bob','agentsam_stage')).find(w=>w.key==='countdown');
  assert.deepEqual([alice.pinned,alice.sizeClass,alice.orderIndex,alice.configuration.durationMs],[true,'medium',5,900000]);
  assert.deepEqual([bob.pinned,bob.sizeClass,bob.configuration.durationMs],[false,'small',undefined]);
  assert.equal(count('agentsam_widget_preferences'),1);
  await assert.rejects(()=>changeAccountWidget(db,'alice',{...body('countdown'),sizeClass:'large'}),/widget_size_invalid/);
  await assert.rejects(()=>changeAccountWidget(db,'alice',{...body('countdown'),configuration:{durationMs:-1}}),/widget_configuration_invalid/);
  await assert.rejects(()=>changeAccountWidget(db,'bob',{...body('clock'),pinned:true}),/widget_not_installed/);
});

test('uninstall cascades account layout and preferences without touching another account',async()=>{
  const {sqlite,db,count}=fixture();
  await installAccountWidget(db,'alice',body('countdown'));
  await changeAccountWidget(db,'alice',{...body('countdown'),configuration:{durationMs:300000}});
  await installAccountWidget(db,'bob',body('countdown'));
  assert.equal((await removeAccountWidget(db,'alice',body('countdown'))).removed,true);
  assert.equal(count('agentsam_widget_installations'),1);
  assert.equal(count('agentsam_widget_layouts'),1);
  assert.equal(count('agentsam_widget_preferences'),0);
  assert.equal(sqlite.prepare("SELECT account_id FROM agentsam_widget_installations").get().account_id,'bob');
});

test('HTTP widget endpoints enforce authorization, origin, request schema, and readiness',async()=>{
  const {db}=fixture();
  const req=(method,data,origin='https://host.example')=>new Request('https://host.example/api/widgets'+(method==='GET'?'?surface=agentsam_stage':''),
    {method,...(method==='GET'?{}:{headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)})});
  assert.equal((await handleAccountWidgetsRequest(req('GET'),db,null)).status,401);
  const get=await handleAccountWidgetsRequest(req('GET'),db,'alice');
  assert.equal(get.status,200);
  assert.equal((await get.json()).widgets.filter(w=>w.available).length,4);
  assert.equal((await handleAccountWidgetsRequest(req('POST',body('countdown')),db,'alice')).status,201);
  assert.equal((await handleAccountWidgetsRequest(req('POST',body('quick-controls')),db,'alice')).status,409);
  assert.equal((await handleAccountWidgetsRequest(req('POST',{...body('clock'),extra:true}),db,'alice')).status,400);
  assert.equal((await handleAccountWidgetsRequest(req('PATCH',{...body('clock'),pinned:true}),db,'alice')).status,404);
  assert.equal((await handleAccountWidgetsRequest(req('POST',body('clock'),'https://evil.example'),db,'alice')).status,403);
});

test('atomic reorder preserves the caller account and pinned segment', async () => {
  const {db,sqlite} = fixture();
  for (const key of ['countdown','clock','queues']) await installAccountWidget(db, 'alice', body(key));
  for (const key of ['countdown','clock']) await installAccountWidget(db, 'bob', body(key));
  await changeAccountWidget(db,'alice',{...body('queues'),pinned:true});
  const reordered = await reorderAccountWidgets(db,'alice',{surface:'agentsam_stage',order:['queues','clock','countdown']});
  assert.deepEqual(reordered.order,['queues','clock','countdown']);
  const alice = sqlite.prepare("SELECT i.widget_key,l.order_index FROM agentsam_widget_installations i JOIN agentsam_widget_layouts l ON l.installation_id=i.id WHERE i.account_id='alice' ORDER BY l.order_index").all();
  const bob = sqlite.prepare("SELECT i.widget_key,l.order_index FROM agentsam_widget_installations i JOIN agentsam_widget_layouts l ON l.installation_id=i.id WHERE i.account_id='bob' ORDER BY l.order_index").all();
  assert.deepEqual(alice.map(row=>row.widget_key),['queues','clock','countdown']);
  assert.deepEqual(bob.map(row=>row.order_index),[0,1]);
  await assert.rejects(()=>reorderAccountWidgets(db,'alice',{surface:'agentsam_stage',order:['clock','queues','countdown']}),/widget_order_pin_boundary/);
  await assert.rejects(()=>reorderAccountWidgets(db,'alice',{surface:'agentsam_stage',order:['clock','countdown']}),/widget_order_stale/);
  await assert.rejects(()=>reorderAccountWidgets(db,'alice',{surface:'agentsam_stage',order:['queues','clock','clock']}),/widget_order_invalid/);
  const unchanged = sqlite.prepare("SELECT i.widget_key FROM agentsam_widget_installations i JOIN agentsam_widget_layouts l ON l.installation_id=i.id WHERE i.account_id='alice' ORDER BY l.order_index").all();
  assert.deepEqual(unchanged.map(row=>row.widget_key),['queues','clock','countdown']);
});

test('reorder endpoint enforces authorization, origin and JSON',async()=>{
  const {db}=fixture();
  await installAccountWidget(db,'alice',body('clock'));
  const order={surface:'agentsam_stage',order:['clock']};
  const req=(origin)=>new Request('https://host.example/api/widgets',{method:'PUT',headers:{origin,'content-type':'application/json'},body:JSON.stringify(order)});
  assert.equal((await handleAccountWidgetsRequest(req('https://host.example'),db,null)).status,401);
  assert.equal((await handleAccountWidgetsRequest(req('https://evil.example'),db,'alice')).status,403);
  assert.equal((await handleAccountWidgetsRequest(req('https://host.example'),db,'alice')).status,200);
});
