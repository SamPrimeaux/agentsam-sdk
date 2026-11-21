import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityAdapter } from '../../src/agent/capability-adapter.js';
const id='cad.building.export';
const request={source:{kind:'file',mount:'work',path:'buildings/house.json'},base:'a'.repeat(64)};

test('package capability is hidden until a host installs and probes a real handler',async()=>{
  const bare=createCapabilityAdapter();
  assert.equal(bare.canInvoke(id),false);
  assert.equal(bare.toolDescriptors().some(x=>x.name===id),false);
  const result=(await bare.invoke('capability.invoke',{capability_id:id,input:request})).result;
  assert.equal(result.error,'capability_handler_unavailable');
  const withoutProbe=createCapabilityAdapter({handlers:{[id]:async()=>({ok:true})},authorizeCapability:async()=>true});
  assert.equal(withoutProbe.canInvoke(id),false,'a handler without probe metadata cannot become executable');
  assert.equal((await withoutProbe.invoke('capability.invoke',{capability_id:id,input:request})).result.error,'capability_handler_unavailable');
  let state={readiness:'unverified',reason:'host_not_probed'};
  let calls=0;
  const handler=async input=>{calls++;assert.deepEqual(input,request);return {ok:true,source_sha256:request.base};};
  handler.availability=()=>state;
  const adapter=createCapabilityAdapter({handlers:{[id]:handler},authorizeCapability:async()=>true});
  assert.equal(adapter.canInvoke(id),false);
  assert.equal(adapter.toolDescriptors().some(x=>x.name===id),false);
  let blocked=(await adapter.invoke('capability.invoke',{capability_id:id,input:request})).result;
  assert.equal(blocked.error,'capability_handler_unavailable');
  assert.equal(calls,0);
  state={readiness:'available',reason:null};
  assert.equal(adapter.canInvoke(id),true);
  assert.equal(adapter.toolDescriptors().some(x=>x.name===id),true);
  const receipt=(await adapter.invoke('capability.invoke',{capability_id:id,input:request})).result;
  assert.equal(receipt.ok,true);
  assert.equal(receipt.result.source_sha256,request.base);
  assert.equal(calls,1);
  state={readiness:'unavailable',reason:'cad_required_engine_unavailable'};
  assert.equal(adapter.canInvoke(id),false);
  assert.equal(adapter.toolDescriptors().some(x=>x.name===id),false);
  assert.equal((await adapter.invoke('capability.invoke',{capability_id:id,input:request})).result.error,'capability_handler_unavailable');
  assert.equal(calls,1);
});

test('direct and delegated IAMScene building export both require host authority',async()=>{
  let calls=0;
  const handler=async()=>{calls++;return {ok:true};};
  handler.availability=()=>({readiness:'available',reason:null});
  const adapter=createCapabilityAdapter({handlers:{[id]:handler}});
  assert.equal(adapter.canInvoke(id),true);
  const delegated=(await adapter.invoke('capability.invoke',{capability_id:id,input:request})).result;
  assert.equal(delegated.error,'capability_not_authorized');
  await assert.rejects(()=>adapter.invoke(id,request),/capability_not_authorized/);
  assert.equal(calls,0);
  const recursion=(await adapter.invoke('capability.invoke',{capability_id:'capability.invoke',input:{}})).result;
  assert.equal(recursion.error,'capability_target_invalid');
  const unknown=(await adapter.invoke('capability.invoke',{capability_id:'undeclared.fake',input:{}})).result;
  assert.equal(unknown.error,'capability_not_declared');
});

test('unauthorized resource input cannot bypass delegated capability approval',async()=>{
  let requested;
  const handler=async()=>({ok:true});
  handler.availability=()=>({readiness:'available',reason:null});
  const adapter=createCapabilityAdapter({handlers:{[id]:handler},authorizeCapability:async req=>{requested=req;return false;}});
  const result=(await adapter.invoke('capability.invoke',{capability_id:id,input:request})).result;
  assert.equal(result.error,'capability_not_authorized');
  assert.equal(requested.capability.id,id);
  assert.deepEqual(requested.input,request);
});
