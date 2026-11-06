import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createAdminAgentSamSkill } from "../apps/ecommerce-cms-agentsam/backend/agentsam/skill-authoring.js";
import { listAgentSamSkills, getAgentSamSkill, resolveSkillsForChat } from "../apps/ecommerce-cms-agentsam/backend/agentsam/skills.js";
import { __setApplicationAccountId } from "../apps/ecommerce-cms-agentsam/backend/lib/account-context.js";

afterEach(() => __setApplicationAccountId(null));
function buildEnv() {
  const db = new DatabaseSync(":memory:");
  const ddl = readFileSync(new URL("../migrations/d1/0011_agentsam_skill_v2.sql", import.meta.url), "utf8");
  db.exec(ddl);
  const prepare=sql=>({bind(...args) {
    const stmt=db.prepare(sql);
    return {first:async()=>stmt.get(...args),all:async()=>({results:stmt.all(...args)}),
      run:async()=>({meta:{changes:stmt.run(...args).changes}})};
  }});
  return {env:{DB:{prepare}},db};
}
const url="https://test.invalid/api/admin/agentsam/skills";
function req(body,extra={}) {
  return new Request(url,{
    method:"POST",
    headers:{"content-type":"application/json","origin":"https://test.invalid",...extra},
    body:JSON.stringify(body),
  });
}
const input={
  name:"Canvas quality checks",
  trigger:"/canvas-quality",
  description:"Verify responsive artboards and honest state",
  content:"# Canvas quality\nCheck real layout, backend behavior, saved revisions, and missing assets before approving.",
};
const actor={id:"au_authorized"};
test("composer skill create persists in canonical private account registry and is discoverable",async()=>{
  const {env,db}=buildEnv();
  __setApplicationAccountId("acct_one");
  const res=await createAdminAgentSamSkill(req(input),env,actor);
  assert.equal(res.status,201);
  const data=await res.json();
  assert.equal(data.ok,true);
  assert.equal(data.skill.slug,"canvas-quality");
  const rows=await listAgentSamSkills(env);
  assert.equal(rows.length,1);
  assert.equal(rows[0].slug,"canvas-quality");
  assert.equal(db.prepare("SELECT account_id FROM agentsam_skill").get().account_id,"acct_one");
  db.close();
});
test("listing, manual slash lookup and contextual routing work without optional reference table",async()=>{
  const {env,db}=buildEnv();__setApplicationAccountId("acct_one");
  assert.equal((await createAdminAgentSamSkill(req(input),env,actor)).status,201);
  const skill=await getAgentSamSkill(env,"canvas-quality",{includeReferences:true});
  assert.equal(skill.slug,"canvas-quality");
  assert.match(skill.content_markdown,/Canvas quality/);
  const picked=await resolveSkillsForChat(env,"Please use /canvas-quality to review this Canvas");
  assert.equal(picked.length,1);
  assert.equal(picked[0].slug,"canvas-quality");
  db.close();
});
test("admin skill creation rejects unauthorized, forged origin and invalid inputs",async()=>{
 const {env,db}=buildEnv();__setApplicationAccountId("acct_one");
 assert.equal((await createAdminAgentSamSkill(req(input),env,null)).status,401);
 assert.equal((await createAdminAgentSamSkill(req(input,{origin:"https://other.invalid"}),env,actor)).status,403);
 assert.equal((await createAdminAgentSamSkill(req({...input,trigger:"/not valid"}),env,actor)).status,400);
 assert.equal((await createAdminAgentSamSkill(req({...input,content:"x"}),env,actor)).status,400);
 assert.equal(db.prepare("SELECT count(*) AS n FROM agentsam_skill").get().n,0);
 db.close();
});
test("duplicate private slash trigger conflicts and cannot overwrite prior instructions",async()=>{
 const {env,db}=buildEnv();__setApplicationAccountId("acct_one");
 assert.equal((await createAdminAgentSamSkill(req(input),env,actor)).status,201);
 const second=await createAdminAgentSamSkill(req({...input,content:"# Second version\nUnapproved overwrite."}),env,actor);
 assert.equal(second.status,409);
 assert.equal((await second.json()).error,"skill_trigger_conflict");
 assert.equal(db.prepare("SELECT count(*) AS n FROM agentsam_skill").get().n,1);
 assert.match(db.prepare("SELECT content_markdown FROM agentsam_skill").get().content_markdown,/Check real layout/);
 db.close();
});
test("account scope isolates the created skill from another signed-in account",async()=>{
 const {env,db}=buildEnv();__setApplicationAccountId("acct_one");
 assert.equal((await createAdminAgentSamSkill(req(input),env,actor)).status,201);
 __setApplicationAccountId("acct_two");
 assert.equal((await listAgentSamSkills(env)).length,0);
 assert.equal(await getAgentSamSkill(env,"canvas-quality"),null);
 assert.deepEqual(await resolveSkillsForChat(env,"/canvas-quality"),[]);
 db.close();
});
