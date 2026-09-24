import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {D1ProjectStore} from '../../src/lib/cad/d1-project-store.js';
const schema="CREATE TABLE designstudio_design_blueprints (\n  id TEXT PRIMARY KEY DEFAULT ('dsb_' || lower(hex(randomblob(8)))),\n\n  tenant_id TEXT NOT NULL DEFAULT 'tenant_inneranimalmedia',\n  workspace_id TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',\n  project_id TEXT,\n\n  title TEXT NOT NULL,\n  description TEXT,\n  original_prompt TEXT,\n\n  intent_json TEXT NOT NULL DEFAULT '{}',\n\n  cad_script TEXT,\n  cad_engine TEXT DEFAULT 'openscad',\n\n  sketch_json TEXT DEFAULT '{}',\n  preview_image_url TEXT,\n\n  generation_config_json TEXT DEFAULT '{}',\n\n  latest_asset_id TEXT,\n  latest_run_id TEXT,\n\n  status TEXT NOT NULL DEFAULT 'draft'\n    CHECK (status IN (\n      'draft',\n      'structured',\n      'generated',\n      'validated',\n      'exported',\n      'failed'\n    )),\n\n  quality_score REAL DEFAULT 0,\n  success_rate REAL DEFAULT 0,\n\n  tags TEXT DEFAULT '[]',\n  notes TEXT,\n\n  total_tokens INTEGER DEFAULT 0,\n  total_cost_usd REAL DEFAULT 0,\n  avg_latency_ms REAL DEFAULT 0,\n\n  created_at TEXT NOT NULL DEFAULT (datetime('now')),\n  updated_at TEXT NOT NULL DEFAULT (datetime('now'))\n, preview_svg_url TEXT);\nCREATE TABLE \"scene_snapshots\" (\n  id              TEXT PRIMARY KEY DEFAULT ('scene_' || lower(hex(randomblob(8)))),\n  workspace_id    TEXT NOT NULL,\n  user_id         TEXT NOT NULL,\n  tenant_id       TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',\n  name            TEXT NOT NULL DEFAULT 'Untitled Scene',\n  project_type    TEXT NOT NULL DEFAULT 'SANDBOX',\n  entity_count    INTEGER NOT NULL DEFAULT 0,\n  r2_key          TEXT NOT NULL,\n  r2_bucket       TEXT NOT NULL DEFAULT 'inneranimalmedia',\n  public_url      TEXT,\n  thumbnail_r2_key TEXT,\n  thumbnail_url   TEXT,\n  tags            TEXT DEFAULT '[]',\n  description     TEXT,\n  is_autosave     INTEGER NOT NULL DEFAULT 0,\n  version         INTEGER NOT NULL DEFAULT 1,\n  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),\n  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())\n, project_id TEXT, glb_r2_key TEXT, style_preset TEXT, voxel_count INTEGER, cad_job_id TEXT);";
const project=JSON.parse(fs.readFileSync(new URL('../fixtures/cad/courtyard-house.json',import.meta.url),'utf8'));
test('existing D1 tables support scoped immutable revisions and optimistic concurrency',async t=>{
 const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());sqlite.exec(schema);
 const db={prepare(sql){return {bind(...params){return {sql,params,async first(){return sqlite.prepare(sql).get(...params)||null;}};}};},
 async batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(s=>({meta:{changes:Number(sqlite.prepare(s.sql).run(...s.params).changes)}}));sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const blobs=new Map(),objects={async put(k,v){blobs.set(k,v);},async get(k){return blobs.has(k)?{async text(){return blobs.get(k);}}:null;}};
 const scope={account_id:'test-owner',workspace_id:'test-workspace',tenant_id:'test-tenant'};
 const store=new D1ProjectStore({db,objects,bucket:'test-bucket',scope});
 await store.save(project,0);
 await store.save({...project,name:'Revision two'},1);
 await assert.rejects(store.save(project,1),/revision_conflict/);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM scene_snapshots').get().n,2);
 assert.equal((await store.read(project.id,1)).project.name,project.name);
 assert.equal((await store.restore(project.id,1,2)).revision,3);
 const other=new D1ProjectStore({db,objects,bucket:'test-bucket',scope:{...scope,account_id:'other'}});
 await assert.rejects(other.read(project.id),/project_not_found/);
 await assert.rejects(other.save(project,3),/revision_conflict/);
 assert.equal((await store.read(project.id)).revision,3);
});
