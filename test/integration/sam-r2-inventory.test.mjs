import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {createShellSamAdapter} from '../../src/sam/shell-host.js';
import {createCloudflareR2InventoryHandler,R2_INVENTORY_OPERATION as op} from '../../src/sam/adapters/cloudflare-r2-inventory.js';
const identity={actorId:'actor',accountId:'account',installationId:'install'};
const fixture = (fetchImpl) => createCloudflareR2InventoryHandler({resolveAuthority:async()=>({value:'fixture'}),resolveOrigin:()=> 'https://studio.example',fetchImpl});
const page=(overrides={})=>({ok:true,bucket:'theme-store',prefix:'packages/',delimiter:'/',objects:[{key:'packages/index.json',size:42}],prefixes:['packages/platform/'],cursor:'next+opaque=',truncated:true,...overrides});
test('R2 inventory uses the shared connector route and preserves cursor and folder prefixes',async()=>{
 const calls=[]; const handler=fixture(async(url,init)=>{calls.push({url,init});return Response.json(page(calls.length===2?{cursor:null,truncated:false}:{}));});
 const input={bucketRef:'theme-store',prefix:'packages/',pageSize:10,connectionRef:'cf-connection'};
 const first=await handler(input,identity); assert.deepEqual(first.prefixes,['packages/platform/']);
 const second=await handler({...input,cursor:first.cursor},identity);assert.equal(second.truncated,false);
 assert.equal(calls[0].url.pathname,'/api/connections/cloudflare/r2/buckets/theme-store/objects');assert.equal(calls[0].url.searchParams.get('per_page'),'10');assert.equal(calls[0].url.searchParams.get('connection_id'),'cf-connection');assert.equal(calls[1].url.searchParams.get('cursor'),'next+opaque=');assert.equal(calls[0].init.headers.Authorization,'Bearer fixture');
});
test('recursive mode and provider errors fail closed',async()=>{
 const handler=fixture(async(url)=>{assert.equal(url.searchParams.get('delimiter'),'');return Response.json({ok:false,error:'cloudflare_permission_denied'},{status:403});});
 await assert.rejects(handler({bucketRef:'theme-store',delimiter:''},identity),/cloudflare_permission_denied/);
 await assert.rejects(handler({bucketRef:'../private'},identity),/r2_bucket_invalid/);
 await assert.rejects(handler({bucketRef:'theme-store'},{}),/missing_trusted_identity/);
 const invalid=fixture(async()=>Response.json(page({cursor:null})));await assert.rejects(invalid({bucketRef:'theme-store',prefix:'packages/'},identity),/invalid_cursor/);
});
test('shell exposes bound R2 SAM operation, validates input and applies authorization before calling connector',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'sam-r2-'));try{
  let calls=0,permit=true;const adapter=createShellSamAdapter({state:{cwd:tmp,projectRoot:tmp,home:tmp},trustedIdentity:identity,authorize:async()=>permit,r2InventoryHandler:fixture(async()=>{calls++;return Response.json(page());})});
  assert.ok(adapter.canInvoke(op));assert.ok(adapter.toolDescriptors().find(t=>t.name===op).output_schema);
  const input={bucketRef:'theme-store',prefix:'packages/'};const result=await adapter.invoke(op,input);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.data.cursor,'next+opaque=');assert.equal(calls,1);
  permit=false;assert.equal((await adapter.invoke(op,input)).ok,false);assert.equal(calls,1);
  permit=true;assert.equal((await adapter.invoke(op,{...input,ownerId:'forged'})).ok,false);assert.equal(calls,1);
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});
