import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {handleStudioSkills} from "../backend/worker/studio-skills.js";

const base="https://agentsam.inneranimalmedia.com";
function fixture(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec(`CREATE TABLE agentsam_skill(
   id TEXT PRIMARY KEY,account_id TEXT NOT NULL,name TEXT NOT NULL,
   slash_trigger TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',
   content_markdown TEXT NOT NULL DEFAULT '',content_checksum TEXT NOT NULL DEFAULT '',
   is_active INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1,
   access_mode TEXT NOT NULL DEFAULT 'read_write',sort_order INTEGER NOT NULL DEFAULT 0,
   updated_at TEXT DEFAULT (datetime('now')),
   UNIQUE(account_id,slash_trigger)
 );`);
 return {sqlite,env:{DB:{prepare(sql){
   const stmt=sqlite.prepare(sql);let values=[];
   const bound={bind(...args){values=args;return bound},
     all(){return{results:stmt.all(...values)}},
     first(){return stmt.get(...values)||null},
     run(){const x=stmt.run(...values);return {meta:{changes:x.changes}}}};
   return bound;
 }}}};
}
const call=(env,account,path,method="GET",data,headers={})=>handleStudioSkills(
 new Request(base+"/api/settings/skills"+path,{
   method,headers:{"content-type":"application/json",...headers},
   body:data===undefined?undefined:JSON.stringify(data),
 }),env,account);
test("skills load only from the authenticated account and cannot be forged from a query",async()=>{
 const {env}=fixture();
 const data={name:"My Brand Skill",trigger:"/my-brand",description:"Brand ops",content:"Read verified BrandContract evidence before drafting."};
 const a=await call(env,"au_owner","","POST",data);assert.equal(a.status,201);
 const own=await (await call(env,"au_owner","")).json();
 const other=await (await call(env,"au_other","")).json();
 assert.equal(own.skills.length,1);
 assert.equal(other.skills.length,0);
 const tamper=await call(env,"au_other","/"+own.skills[0].id,"PUT",{...data,name:"Malicious"});
 assert.equal(tamper.status,404);
});
test("skills require valid triggers and reject cross-origin updates",async()=>{
 const {env}=fixture();
 const data={name:"Bad Skill",trigger:"evil value",description:"x",content:"Useful safe instructions"};
 assert.equal((await call(env,"au_owner","","POST",data)).status,400);
 assert.equal((await call(env,"au_owner","","POST",
   {...data,trigger:"/safe-skill"},{origin:"https://evil.example"})).status,403);
});
test("account can edit or soft-delete only its own saved skill",async()=>{
 const {env}=fixture();
 const data={name:"Original Skill",trigger:"/original",description:"desc",content:"Useful instructions for original."};
 const made=await (await call(env,"au_owner","","POST",data)).json();
 const updated=await call(env,"au_owner","/"+made.skill.id,"PUT",
   {...data,name:"Updated Skill",trigger:"/updated"});
 assert.equal(updated.status,200);
 assert.equal((await (await call(env,"au_owner","")).json()).skills[0].version,2);
 assert.equal((await call(env,"au_other","/"+made.skill.id,"DELETE")).status,404);
 assert.equal((await call(env,"au_owner","/"+made.skill.id,"DELETE")).status,200);
 assert.equal((await (await call(env,"au_owner","")).json()).skills.length,0);
});
