import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {handleStudioAgentSettings} from "../backend/worker/studio-agents-settings.js";

const base="https://agentsam.inneranimalmedia.com";
function fixture(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec(`CREATE TABLE agentsam_subagent_profile(
  id TEXT PRIMARY KEY,user_id TEXT NOT NULL,workspace_id TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL,display_name TEXT NOT NULL,instructions_markdown TEXT,
  allowed_tool_globs TEXT,default_model_id TEXT,is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  description TEXT NOT NULL DEFAULT '',access_mode TEXT NOT NULL DEFAULT 'read_write',
  run_in_background INTEGER NOT NULL DEFAULT 0,sort_order INTEGER NOT NULL DEFAULT 0,
  sandbox_mode TEXT DEFAULT 'workspace-write',model_reasoning_effort TEXT DEFAULT 'medium',
  max_concurrent_threads INTEGER DEFAULT 6,max_spawn_depth INTEGER DEFAULT 1,tool_profile_key TEXT,
  instruction_version INTEGER NOT NULL DEFAULT 1,is_platform_global INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id,workspace_id,slug)
 );
 CREATE TABLE agentsam_user_policy (
 user_id TEXT NOT NULL,workspace_id TEXT NOT NULL DEFAULT '',
 allow_subagent_spawn INTEGER NOT NULL DEFAULT 0,
 allow_fanout_execution INTEGER NOT NULL DEFAULT 0,
 max_spawn_depth INTEGER NOT NULL DEFAULT 1,
 require_allowlist_for_mcp INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY (user_id,workspace_id)
 );`);
 return {sqlite,env:{DB:{prepare(sql){
   const stmt=sqlite.prepare(sql);let args=[];
   const b={bind(...values){args=values;return b},
    all(){return {results:stmt.all(...args)}},
    first(){return stmt.get(...args)||null},
    run(){const r=stmt.run(...args);return {meta:{changes:r.changes}}}};
   return b;
 }}}};
}
const request=(env,account,path,method="GET",body,origin)=>handleStudioAgentSettings(
 new Request(base+"/api/settings/agents"+path,{
  method,headers:{"content-type":"application/json",...(origin?{origin}:{})},
  body:body===undefined?undefined:JSON.stringify(body),
 }),env,account);
const draft={
 name:"Brand Auditor",slug:"brand-auditor",description:"Inspect brand evidence",
 instructions:"Use verified brand materials before making recommendations.",
 modelId:"openai:gpt-6",allowedTools:["brand.read","brand.assets.*"],
 runInBackground:false,sandboxMode:"read-only",reasoningEffort:"medium",
 maxConcurrentThreads:2,active:true
};
test("agent CRUD is account-scoped and preserves a real profile",async()=>{
 const {env,sqlite}=fixture();
 const made=await request(env,"au_owner","","POST",draft);
 assert.equal(made.status,201);
 const {agentId}=await made.json();
 const id=agentId;
 const own=await (await request(env,"au_owner","")).json();
 assert.equal(own.agents.length,1);
 assert.equal(own.agents[0].modelId,"openai:gpt-6");
 assert.deepEqual(own.agents[0].allowedTools,["brand.read","brand.assets.*"]);
 assert.equal((await (await request(env,"au_other","")).json()).agents.length,0);
 assert.equal((await request(env,"au_other","/"+id,"PUT",{...draft,name:"Intruder"})).status,404);
 const saved=await request(env,"au_owner","/"+id,"PUT",{...draft,name:"Brand Reviewer"});
 assert.equal(saved.status,200);
 const changed=sqlite.prepare("SELECT display_name,instruction_version FROM agentsam_subagent_profile WHERE id=?").get(id);
 assert.equal(changed.display_name,"Brand Reviewer");
 assert.equal(changed.instruction_version,2);
 assert.equal((await request(env,"au_other","/"+id,"DELETE")).status,404);
 assert.equal((await request(env,"au_owner","/"+id,"DELETE")).status,200);
 assert.equal((await (await request(env,"au_owner","")).json()).agents[0].active,false);
});
test("new agents can be saved disabled and later activated without a new profile",async()=>{
 const {env}=fixture();
 const created=await request(env,"au_owner","","POST",{...draft,slug:"disabled-agent",active:false});
 assert.equal(created.status,201);
 const {agentId}=await created.json();
 const before=await (await request(env,"au_owner","")).json();
 assert.equal(before.agents.find(row=>row.id===agentId).active,false);
 const enabled=await request(env,"au_owner","/"+agentId,"PUT",{...draft,slug:"disabled-agent",active:true});
 assert.equal(enabled.status,200);
 const after=await (await request(env,"au_owner","")).json();
 assert.equal(after.agents.find(row=>row.id===agentId).active,true);
});
test("platform templates can be read and cloned but never mutated",async()=>{
 const {env,sqlite}=fixture();
 sqlite.prepare("INSERT INTO agentsam_subagent_profile(id,user_id,slug,display_name,instructions_markdown,is_platform_global) VALUES (?,?,?,?,?,1)")
 .run("asp_platform","platform","planner","Planner","Plan using real evidence.");
 const list=await (await request(env,"au_owner","")).json();
 assert.equal(list.templates.length,1);
 assert.equal(list.templates[0].readOnly,true);
 assert.equal((await request(env,"au_owner","/asp_platform","PUT",draft)).status,404);
 assert.equal((await request(env,"au_owner","/asp_platform","DELETE")).status,404);
});
test("reject malformed agent writes and cross-site mutation attempts",async()=>{
 const {env}=fixture();
 assert.equal((await request(env,"au_owner","","POST",{...draft,modelId:"javascript:alert(1)"})).status,400);
 assert.equal((await request(env,"au_owner","","POST",draft,"https://example.net")).status,403);
 assert.equal((await request(env,null,"")).status,401);
});
test("policy is an existing account record, not a simulated UI toggle",async()=>{
 const {env}=fixture();
 const policy={allowSubagentSpawn:true,allowFanoutExecution:false,maxSpawnDepth:2,requireAllowlistForMcp:true};
 assert.equal((await request(env,"au_owner","/policy","PUT",policy)).status,200);
 assert.deepEqual((await (await request(env,"au_owner","/policy")).json()).policy,policy);
 assert.equal((await (await request(env,"au_other","/policy")).json()).policy.allowSubagentSpawn,false);
});
