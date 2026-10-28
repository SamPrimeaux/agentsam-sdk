import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { createSqliteD1 } from './work-sqlite-d1.js';
import { readProjectMeasurements, handleProjectTimer, refreshProjectMetrics } from './work-project-metrics.js';
import { readProjectInsights } from './work-project-insights.js';
import { isWorkRequest } from './work-service.js';

const migration = readFileSync(new URL('../migrations/1349_projects_metrics_time_ssot.sql',import.meta.url),'utf8');
function setup() {
 const db=createSqliteD1(':memory:');
 db.exec([
  "CREATE TABLE projects (id TEXT PRIMARY KEY,owner_user_id TEXT,tenant_id TEXT,name TEXT)",
  "INSERT INTO projects VALUES ('p1','owner','tenant','DreamHouse'),('p2','other','tenant','Other')",
  "CREATE TABLE project_metrics (id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL,total_hours REAL,total_cost REAL,api_tokens_used INTEGER,last_updated TEXT,FOREIGN KEY(project_id) REFERENCES projects(id))",
  "INSERT INTO project_metrics (project_id,total_hours,total_cost,api_tokens_used) VALUES ('p1',37.5,42,999)",
  "CREATE TABLE time_entries (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,workspace_id TEXT,project_id TEXT,project_name TEXT,description TEXT NOT NULL,hours REAL NOT NULL,rate_cents INTEGER,started_at INTEGER,ended_at INTEGER,source TEXT NOT NULL,billable INTEGER,approved INTEGER,created_at INTEGER,updated_at INTEGER)",
  "CREATE TABLE project_costs (id INTEGER PRIMARY KEY,project_id INTEGER,amount REAL,currency TEXT,total_tokens INTEGER,user_id TEXT)",
  "INSERT INTO project_costs (project_id,amount,currency,total_tokens,user_id) VALUES ('p1',0.55,'USD',1800,'owner'),('p2',99,'USD',10000,'other')",
  "CREATE TABLE project_storage (id TEXT, project_id TEXT,storage_type TEXT,storage_name TEXT,status TEXT)",
  "INSERT INTO project_storage VALUES ('s1','p1','local','DreamHouse working repo','active'),('s2','p1','github','sam/dreamhouse','active'),('s3','p1','r2','cad','active')",
  "CREATE TABLE user_oauth_tokens (user_id TEXT,provider TEXT,is_active INTEGER,revoked_at INTEGER)",
  "INSERT INTO user_oauth_tokens VALUES ('owner','github',1,NULL),('other','cloudflare',1,NULL)"
 ].join(';\n')+';');
 db.exec(migration);
 return db;
}
test('migration preserves legacy estimates and fixes project id to TEXT',async()=>{
 const db=setup();try{
  const cols=(await db.prepare('PRAGMA table_info(project_metrics)').all()).results;
  assert.equal(cols.find(x=>x.name==='project_id').type,'TEXT');
  assert.equal((await db.prepare("SELECT total_hours, legacy_hours FROM project_metrics WHERE project_id='p1'").first()).legacy_hours,37.5);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM project_metrics_legacy_20261028').first()).n,1);
 }finally{db.close();}
});
test('start stop end-to-end, ledger authority and no duplicate timers',async()=>{
 const db=setup();try{
  assert.equal(isWorkRequest('/api/work/projects/p1/timer/start'),true);
  const start=()=>handleProjectTimer(new Request('https://local/api/work/projects/p1/timer/start',{method:'POST',body:'{}'}),db,'owner','p1','start');
  let r=await start();assert.equal(r.status,200);let data=await r.json();
  assert.equal(data.metricsPersisted,true);
  assert.ok(data.measurements.activeTimer.id);
  const timerId=data.measurements.activeTimer.id;
  assert.equal((await start()).status,409);
  r=await handleProjectTimer(new Request('https://local/',{method:'POST',body:JSON.stringify({timerId})}),db,'other','p1','stop');
  assert.equal(r.status,404);
  r=await handleProjectTimer(new Request('https://local/',{method:'POST',body:JSON.stringify({timerId})}),db,'owner','p1','stop');
  assert.equal(r.status,200);data=await r.json();
  assert.equal(data.measurements.activeTimer,null);
  assert.equal(data.measurements.measured.entries,1);
  assert.equal(data.measurements.costs.recordedTotal,0.55);
  assert.equal(data.measurements.costs.apiTokens,1800);
  assert.equal(data.measurements.legacy.hours,37.5);
  assert.equal((await db.prepare("SELECT time_entry_count FROM project_metrics WHERE project_id='p1'").first()).time_entry_count,1);
  assert.equal((await handleProjectTimer(new Request('https://local/',{method:'POST',body:JSON.stringify({timerId})}),db,'owner','p1','stop')).status,409);
  assert.equal(await readProjectMeasurements(db,'other','p1'),null);
 }finally{db.close();}
});
test('auto import hours and stale open intervals do not become measured sessions',async()=>{
 const db=setup();try{
  db.exec("INSERT INTO time_entries VALUES ('old','owner','tenant',NULL,'p1','DreamHouse','legacy auto',700,0,1,2520001,'auto',0,0,1,2)");
  db.exec("INSERT INTO time_entries VALUES ('too-long','owner','tenant',NULL,'p1','DreamHouse','long timer',33,0,1,118801,'manual',0,0,1,2)");
  const m=await refreshProjectMetrics(db,'owner','p1');
  assert.equal(m.measured.available,false);
  assert.equal(m.measured.entries,0);
  assert.equal(m.measured.excludedEntries,2);
  assert.equal(m.measured.hours,0);
  const insight=await readProjectInsights(db,'owner','p1');
  assert.equal(insight.measurements.measured.available,false);
  assert.equal(insight.connections.find(x=>x.type==='github').verification,'oauth_record_active');
  assert.equal(insight.connections.find(x=>x.type==='r2').verification,'storage_registration_only');
  assert.equal(await readProjectInsights(db,'other','p1'),null);
 }finally{db.close();}
});
