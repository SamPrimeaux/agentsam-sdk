import test from "node:test";
import assert from "node:assert/strict";
import { handleStudioStorageSettings } from "./studio-storage-settings.js";

function fakeDB(){
 const prefs=new Map();
 const connections=[{provider:"google_cloud",status:"active",last_verified_at:1762700000}];
 const grants=[{provider:"google_drive",grants:1,access_token_encrypted:"never-expose-this"}];
 const apply=async(sql,args)=>{
   if(sql.startsWith("UPDATE user_storage_provider_preferences SET is_default")){
     for(const row of prefs.values())if(row.owner_user_id===args[0])row.is_default=0;
     return {success:true};
   }
   if(sql.startsWith("INSERT INTO user_storage_provider_preferences")){
     const [owner_user_id,provider,is_enabled,is_default,preferences_json]=args;
     prefs.set(owner_user_id+":"+provider,{owner_user_id,provider,is_enabled,is_default,preferences_json,updated_at:123});
     return {success:true};
   }
   throw new Error("unexpected SQL: "+sql);
 };
 return {
   prefs,
   prepare(sql){return {bind(...args){return {
     sql,args,run:()=>apply(sql,args),
     all:async()=>{
       if(sql.includes("FROM user_storage_provider_preferences"))return {results:[...prefs.values()].filter(r=>r.owner_user_id===args[0])};
       if(sql.includes("FROM cloud_provider_connections"))return {results:connections};
       if(sql.includes("FROM user_oauth_tokens"))return {results:grants};
       throw new Error("unexpected SQL: "+sql);
     },
   };}};},
   batch:async(statements)=>{for(const s of statements)await apply(s.sql,s.args);return statements.map(()=>({success:true}));},
 };
}
function req(method="GET",body){
 return new Request("https://studio.example/api/settings/storage",{
   method,headers:{"origin":"https://studio.example","content-type":"application/json"},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),
 });
}
test("storage settings require an authenticated account",async()=>{
 const res=await handleStudioStorageSettings(req(),{DB:fakeDB()},null);
 assert.equal(res.status,401);
});
test("GET reveals only safe preference fields and redacted connection hints",async()=>{
 const db=fakeDB();
 db.prefs.set("acct1:s3",{owner_user_id:"acct1",provider:"s3",is_enabled:1,is_default:0,
   preferences_json:JSON.stringify({bucket:"media",secretKey:"never-expose-this"}),updated_at:123});
 const res=await handleStudioStorageSettings(req(),{DB:db},"acct1");
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.preferences[0].config.bucket,"media");
 assert.equal(body.preferences[0].config.secretKey,undefined);
 assert.equal(body.connectionHints.oauth[0].authorizationRecorded,true);
 assert.equal(JSON.stringify(body).includes("never-expose-this"),false);
});
test("PUT validates provider fields, URLs, and never accepts secret material",async()=>{
 const db=fakeDB();
 for(const body of [
   {provider:"cloudflare_images",enabled:true,isDefault:false,config:{}},
   {provider:"s3",enabled:true,isDefault:false,config:{accessKey:"secret"}},
   {provider:"s3",enabled:true,isDefault:false,config:{endpoint:"http://insecure.example"}},
   {provider:"s3",enabled:false,isDefault:true,config:{}},
 ]) {
   const res=await handleStudioStorageSettings(req("PUT",body),{DB:db},"acct1");
   assert.equal(res.status,400);
 }
 assert.equal(db.prefs.size,0);
});
test("PUT saves per-account preferences and atomically moves the default",async()=>{
 const db=fakeDB();
 const first={provider:"s3",enabled:true,isDefault:true,config:{bucket:"media",region:"us-east-1"}};
 const second={provider:"google_drive",enabled:true,isDefault:true,config:{folderId:"folder-123"}};
 for(const body of [first,second]){
   const res=await handleStudioStorageSettings(req("PUT",body),{DB:db},"acct1");
   assert.equal(res.status,200);
 }
 const rows=(await (await handleStudioStorageSettings(req(),{DB:db},"acct1")).json()).preferences;
 assert.equal(rows.filter(x=>x.isDefault).length,1);
 assert.equal(rows.find(x=>x.provider==="google_drive").isDefault,true);
 assert.equal(rows.find(x=>x.provider==="s3").isDefault,false);
});

test("saved provider locations cannot leak across accounts",async()=>{
 const db=fakeDB();
 const save={provider:"s3",enabled:true,isDefault:false,config:{bucket:"private-a"}};
 assert.equal((await handleStudioStorageSettings(req("PUT",save),{DB:db},"account-a")).status,200);
 const other=await (await handleStudioStorageSettings(req(),{DB:db},"account-b")).json();
 assert.deepEqual(other.preferences,[]);
 const owner=await (await handleStudioStorageSettings(req(),{DB:db},"account-a")).json();
 assert.equal(owner.preferences[0].config.bucket,"private-a");
});
