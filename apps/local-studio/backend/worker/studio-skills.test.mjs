import test from "node:test";
import assert from "node:assert/strict";
import {handleStudioSkills} from "./studio-skills.js";

function stubDb(){
  const rows=[
    {id:"skill_own",account_id:"acct_a",name:"My skill",slash_trigger:"/mine",description:"my saved skill",content_markdown:"my instructions",version:2,is_active:1,access_mode:"read_only",updated_at:"now"},
    {id:"skill_other",account_id:"acct_b",name:"Other skill",slash_trigger:"/other",description:"other",content_markdown:"other instructions",version:2,is_active:1,access_mode:"read_only",updated_at:"now"},
  ];
  return {rows,prepare(sql){return {bind(...args){return {
    async all(){return {results:rows.filter(row=>row.account_id===args[0]&&row.is_active)};},
    async run(){
      const id=sql.includes("UPDATE agentsam_skill")&&sql.includes("SET is_active=0")?args[0]:args[5];
      const account=sql.includes("SET is_active=0")?args[1]:args[6];
      const target=rows.find(row=>row.id===id&&row.account_id===account&&row.is_active);
      if(!target)return {meta:{changes:0}};
      if(sql.includes("SET is_active=0"))target.is_active=0;
      else Object.assign(target,{name:args[0],slash_trigger:args[1],description:args[2],content_markdown:args[3]});
      return {meta:{changes:1}};
    },
  }}}}};
}
const call=(db,account,method,path="/api/settings/skills",data)=>handleStudioSkills(
  new Request("https://agentsam.inneranimalmedia.com"+path,{
    method,headers:data?{"content-type":"application/json"}:{},
    ...(data?{body:JSON.stringify(data)}:{}),
  }),{DB:db},account);

test("only account-owned skills appear and are editable regardless of legacy read_only metadata",async()=>{
  const db=stubDb();
  const list=await (await call(db,"acct_a","GET")).json();
  assert.equal(list.skills.length,1);
  assert.equal(list.skills[0].readOnly,false);
  assert.equal(list.skills[0].name,"My skill");
  const patch={name:"Edited skill",trigger:"/edited",description:"mine",content:"Long enough instructions"};
  assert.equal((await call(db,"acct_a","PUT","/api/settings/skills/skill_own",patch)).status,200);
  assert.equal(db.rows[0].name,"Edited skill");
  assert.equal((await call(db,"acct_b","DELETE","/api/settings/skills/skill_own")).status,404);
  assert.equal((await call(db,"acct_a","DELETE","/api/settings/skills/skill_own")).status,200);
  assert.equal(db.rows[0].is_active,0);
});
