import { createSqliteD1 } from '../work-sqlite-d1.js';

// Relevant columns of the production tables, inspected on 2026-11-06.
// Real SQLite executes every authorization predicate, constraint and CAS.
export function canvasStorageFixture(){
 const DB=createSqliteD1();
 DB.exec(`
 CREATE TABLE auth_users(id TEXT PRIMARY KEY,default_account_id TEXT);
 INSERT INTO auth_users VALUES ('owner_a','account_a'),('owner_b','account_b');
 CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT,description TEXT,project_type TEXT,owner_user_id TEXT);
 CREATE TABLE agentsam_artifacts(
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,name TEXT NOT NULL,artifact_type TEXT NOT NULL,
 r2_key TEXT NOT NULL,source TEXT NOT NULL,file_size_bytes INTEGER,content_hash TEXT,r2_bucket TEXT DEFAULT 'artifacts',
 scope TEXT DEFAULT 'user',visibility TEXT DEFAULT 'private',artifact_status TEXT DEFAULT 'draft',validation_status TEXT,
 mime_type TEXT,metadata_json TEXT DEFAULT '{}',created_at INTEGER DEFAULT(unixepoch()),updated_at INTEGER DEFAULT(unixepoch()),archived_at INTEGER);
 CREATE TABLE agentsam_executions(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,workspace_id TEXT NOT NULL,user_id TEXT,execution_type TEXT NOT NULL,
 run_id TEXT NOT NULL,execution_key TEXT,status TEXT NOT NULL,duration_ms INTEGER NOT NULL DEFAULT 0,
 started_at_unix INTEGER NOT NULL,completed_at_unix INTEGER,error_log_id TEXT,account_id TEXT,metadata_json TEXT NOT NULL DEFAULT '{}',
 UNIQUE(execution_type,run_id));
 CREATE TABLE agentsam_execution_steps(
 id TEXT PRIMARY KEY,execution_id TEXT NOT NULL REFERENCES agentsam_executions(id) ON DELETE CASCADE,
 node_key TEXT NOT NULL,node_type TEXT,step_type TEXT,status TEXT NOT NULL DEFAULT 'pending'
 CHECK(status IN('pending','running','success','failed','skipped','approval_pending','timed_out','retrying')),
 input_json TEXT DEFAULT '{}',output_json TEXT DEFAULT '{}',error_json TEXT DEFAULT '{}',account_id TEXT,
 started_at INTEGER,completed_at INTEGER,created_at_unix INTEGER NOT NULL DEFAULT(unixepoch()));
 `);
 const objects=new Map();let brokenReads=false,failedWrites=false;
 const ARTIFACTS={
  async put(key,body){if(failedWrites)throw new Error('storage_write_failed');objects.set(key,new Uint8Array(body));},
  async get(key){if(brokenReads)return null;const bytes=objects.get(key);return bytes?{arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}:null;},
  async delete(key){objects.delete(key);},
 };
 return {env:{DB,ARTIFACTS},DB,objects,close:()=>DB.close(),breakReads:value=>brokenReads=value,failWrites:value=>failedWrites=value};
}
