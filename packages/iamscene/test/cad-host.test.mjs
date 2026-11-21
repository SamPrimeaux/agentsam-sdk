import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import { createIAMSceneCadBuildingHost } from '../dist/src/node.js';
const token='test-service-token-must-be-secret';
const hash='1'.repeat(64);
const data=new TextEncoder().encode('verified CAD artifact');
const digest=createHash('sha256').update(data).digest('hex');
const file={path:'shell.ifc',bytes:data.length,sha256:digest,uri:'/v1/files/work/derived/building-abc/shell.ifc'};
const receipt={ok:true,schema:'agentsam.cad.building-export.v1',source:{source_sha256:hash,source_revision:1,scope:'single_rectangular_shell_with_north_south_openings'},output_scope:'runtime-derived',job_id:'building-abc',files:[file,...['shell.step','plan.dxf','plan.svg','preview.png','sheet-A101-proof.pdf','model.glb','model.opt.glb','turntable.mp4'].map((name,i)=>({...file,path:name,uri:`/v1/files/work/derived/building-abc/${name}`}))],receipt:{status:'passed',checks:Array.from({length:16},(_,i)=>({id:'check-'+i,passed:true}))}};
const capabilities={endpoints:{cad_building_export:{operation:'cad.building.export',handler_installed:true,scope:'single_rectangular_shell_with_north_south_openings'}},tools:Object.fromEntries(['freecad','occt','ifc','blender','media'].map(x=>[x,{installed:true}]))};
const response = x=>new Response(JSON.stringify(x),{status:200,headers:{'content-type':'application/json'}});

test('unprobed host cannot execute; positive probe enables scoped source export with verifiable artifacts',async()=>{
 let calls=0;
 const fetchImpl=async (url,options={})=>{
  assert.equal(options.headers.Authorization,'Bearer '+token);
  calls++;
  if(url.endsWith('/v1/capabilities')) return response(capabilities);
  if(url.endsWith('/v1/cad/building/export')) {
   assert.deepEqual(JSON.parse(options.body),{source:{kind:'file',mount:'work',path:'sample.json'},base:hash});
   return response(receipt);
  }
  if(url.endsWith(file.uri)) return new Response(data);
  throw new Error('unexpected route');
 };
 const handler=createIAMSceneCadBuildingHost({endpoint:'https://cad.example.com',token,fetchImpl});
 const input={source:{kind:'file',mount:'work',path:'sample.json'},base:hash};
 assert.equal((await handler(input)).error,'cad_host_unavailable_or_unprobed');
 assert.equal(calls,0);
 assert.equal((await handler.probe()).readiness,'available');
 assert.equal((await handler(input)).ok,true);
 assert.deepEqual(await handler.downloadArtifact(file),data);
});

test('bad resource paths, base and failed probes cannot gain execution',async()=>{
 const h=createIAMSceneCadBuildingHost({endpoint:'https://cad.example.com',token,fetchImpl:async()=>response({endpoints:{},tools:{}})});
 assert.equal((await h.probe()).readiness,'unavailable');
 assert.equal((await h({source:{kind:'file',mount:'work',path:'file.json'}})).error,'cad_host_unavailable_or_unprobed');
 const ready=createIAMSceneCadBuildingHost({endpoint:'https://cad.example.com',token,fetchImpl:async(url)=>url.endsWith('/v1/capabilities')?response(capabilities):response(receipt)});
 await ready.probe();
 for(const ref of [{kind:'file',mount:'work',path:'../secret'}, {kind:'file',mount:'work',path:'/etc/passwd'}, {kind:'file',mount:'work',path:'folder\\file'}])
  assert.equal((await ready({source:ref})).error,'cad_building_resource_ref_invalid');
 assert.equal((await ready({source:{kind:'file',mount:'work',path:'file.json'},base:'bad'})).error,'cad_building_resource_ref_invalid');
 assert.equal((await ready({source:{kind:'file',mount:'work',path:'file.json'},base:'2'.repeat(64)})).error,'cad_building_receipt_verification_failed');
 assert.throws(()=>createIAMSceneCadBuildingHost({endpoint:'http://public.example.com',token}),/endpoint_invalid/);
});
