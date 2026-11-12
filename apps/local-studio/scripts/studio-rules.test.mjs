import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {handleStudioRules,studioRulesAccess} from "../backend/worker/studio-rules.js";

const base="https://studio.example";
// Column set and defaults mirror the deployed agentsam_rules_document table.
const TABLE=`CREATE TABLE agentsam_rules_document (
  id TEXT PRIMARY KEY,user_id TEXT NOT NULL DEFAULT "",workspace_id TEXT NOT NULL DEFAULT "",
  title TEXT NOT NULL,body_markdown TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at_epoch INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at_epoch INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  apply_mode TEXT NOT NULL DEFAULT 'always',globs TEXT DEFAULT "",
  sort_order INTEGER NOT NULL DEFAULT 0,rule_type TEXT NOT NULL DEFAULT 'instruction')`;
function fixture(withTable=true){
 const sqlite=new DatabaseSync(":memory:");
 if(withTable)sqlite.exec(TABLE);
 return {sqlite,env:{DB:{prepare(sql){
   const stmt=sqlite.prepare(sql);let values=[];
   const bound={bind(...args){values=args;return bound},
     all(){return{results:stmt.all(...values)}},
     first(){return stmt.get(...values)||null},
     run(){const x=stmt.run(...values);return {meta:{changes:Number(x.changes)}}}};
   return bound;
 }}}};
}
const call=(env,account,path,method="GET",data,headers={})=>handleStudioRules(
 new Request(base+"/api/settings/rules"+path,{
   method,headers:{"content-type":"application/json",...headers},
   body:data===undefined?undefined:JSON.stringify(data),
 }),env,account);
const rule={name:"Paste protocol",content:"One copy, one paste, one run.",applyMode:"always",globs:"*.py, *.sh"};

test("rules are created, edited, toggled and deleted only by their owning account",async()=>{
 const {env,sqlite}=fixture();
 sqlite.prepare("INSERT INTO agentsam_rules_document(id,user_id,title,body_markdown) VALUES ('global_rule','','Platform','Platform owned body')").run();
 const created=await call(env,"au_owner","","POST",rule);assert.equal(created.status,201);
 const own=await (await call(env,"au_owner","")).json();
 assert.equal(own.rules.length,1,"unowned platform rows are not listed");
 assert.deepEqual(own.access,{create:true,update:true,remove:true,toggle:true});
 assert.equal(own.rules[0].globs,"*.py,*.sh");
 const id=own.rules[0].id;
 assert.equal((await (await call(env,"au_other","")).json()).rules.length,0);
 assert.equal((await call(env,"au_other","/"+id,"PUT",{...rule,name:"Hijack"})).status,404);
 assert.equal((await call(env,"au_other","/"+id+"/enabled","PUT",{enabled:false})).status,404);
 assert.equal((await call(env,"au_other","/"+id,"DELETE")).status,404);
 assert.equal((await call(env,"au_owner","/global_rule","DELETE")).status,404);
 assert.equal((await call(env,"au_owner","/"+id,"PUT",{...rule,name:"Paste protocol v2",applyMode:"on_request"})).status,200);
 assert.equal((await call(env,"au_owner","/"+id+"/enabled","PUT",{enabled:false})).status,200);
 const after=(await (await call(env,"au_owner","")).json()).rules[0];
 assert.equal(after.name,"Paste protocol v2");assert.equal(after.version,2);
 assert.equal(after.enabled,false);assert.equal(after.applyMode,"on_request");
 assert.equal((await call(env,"au_owner","/"+id,"DELETE")).status,200);
 assert.equal((await (await call(env,"au_owner","")).json()).rules.length,0);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM agentsam_rules_document").get().n,1);
});

test("invalid input, foreign origins and unauthenticated calls are rejected",async()=>{
 const {env}=fixture();
 assert.equal((await call(env,"","")).status,401);
 assert.equal((await call(env,"au_owner","","POST",{...rule,content:"short"})).status,400);
 assert.equal((await call(env,"au_owner","","POST",{...rule,applyMode:"whenever"})).status,400);
 assert.equal((await call(env,"au_owner","","POST",rule,{origin:"https://evil.example"})).status,403);
 assert.equal((await call(env,"au_owner","/bad id","PUT",rule)).status,404);
});

test("a stored apply mode outside the editable set survives an edit",async()=>{
 const {env,sqlite}=fixture();
 sqlite.prepare("INSERT INTO agentsam_rules_document(id,user_id,title,body_markdown,apply_mode) VALUES ('legacy_rule','au_owner','Legacy','Legacy trigger body','on_trigger')").run();
 assert.equal((await call(env,"au_owner","/legacy_rule","PUT",{...rule,applyMode:"on_trigger"})).status,200);
 assert.equal((await (await call(env,"au_owner","")).json()).rules[0].applyMode,"on_trigger");
 assert.equal((await call(env,"au_owner","/legacy_rule","PUT",{...rule,applyMode:"on_schedule"})).status,400);
});

test("access is derived from the installed schema, not assumed",async()=>{
 const {env}=fixture(false);
 assert.deepEqual(await studioRulesAccess(env),{create:false,update:false,remove:false,toggle:false});
 const listed=await (await call(env,"au_owner","")).json();
 assert.deepEqual(listed.rules,[]);assert.equal(listed.access.create,false);
 assert.equal((await call(env,"au_owner","","POST",rule)).status,503);
});
