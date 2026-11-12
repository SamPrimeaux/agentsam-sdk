import test from "node:test";
import assert from "node:assert/strict";
import { projectSettingsStorageTargets } from "../frontend/src/lib/storage/settings-targets.ts";

test("storage inventory always preserves distinct Cloudflare service identities",()=>{
  const targets=projectSettingsStorageTargets(true,null,null,{opfs:true,deviceFsa:false});
  assert.equal(targets.length,10);
  for(const service of ["cloudflare-r2","cloudflare-images","cloudflare-stream"]){
    const target=targets.find(t=>t.id===service);
    assert.ok(target);
    assert.equal(target.group,"cloudflare");
    assert.equal(target.access,"unverified");
    assert.equal(target.status,"unknown");
    assert.ok(target.brand);
  }
  assert.equal(targets.find(t=>t.id==="local-opfs").status,"unknown");
});
test("live Cloudflare verification is per-service, not inferred from one OAuth account",()=>{
  const targets=projectSettingsStorageTargets(true,{
    ok:true,account:{id:"cf_123"},
    r2:{available:true,count:3},
    images:{available:false,status:"needs_scope"},
    stream:{available:false,status:"error"},
  });
  const find=id=>targets.find(t=>t.id===id);
  assert.equal(find("cloudflare-r2").access,"verified");
  assert.match(find("cloudflare-r2").detail,/3 buckets/);
  assert.equal(find("cloudflare-images").access,"needs_scope");
  assert.equal(find("cloudflare-stream").access,"unverified");
});
test("S3 and Google Drive preferences are not misrepresented as tested storage access",()=>{
  const settings={ok:true,preferences:[
    {provider:"s3",enabled:true,isDefault:true,config:{bucket:"media"}},
    {provider:"google_drive",enabled:true,isDefault:false,config:{folderId:"folder1"}},
  ],connectionHints:{
    cloud:[],oauth:[{provider:"google_drive",authorizationRecorded:true}],
  }};
  const targets=projectSettingsStorageTargets(false,{status:"not_connected"},settings);
  const s3=targets.find(t=>t.id==="amazon-s3");
  const drive=targets.find(t=>t.id==="google-drive");
  assert.equal(s3.access,"unverified");
  assert.equal(s3.isDefault,true);
  assert.equal(s3.config.bucket,"media");
  assert.equal(drive.access,"authorization_recorded");
  assert.equal(drive.status,"unknown");
  assert.equal(targets.find(t=>t.id==="cloudflare-r2").access,"not_configured");
});
