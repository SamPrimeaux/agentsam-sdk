import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentSamClient } from '../../../client.js';
import { createGeneratedSamOperations } from '../operation-pack.js';

const identity = {accountId:'test-account',actorId:'test-actor',installationId:'test-installation',authorizedLaneRef:'test-owned-device'};
function harness({authorized=true,exitCode=0,status='completed',bound=true}={}) {
  const operations=new Map();
  const calls=[];
  const runtime=bound?{executeScript:async args=>{calls.push(args);return {executionId:'integration-fixture',status,exitCode,stdout:'test receipt',stderr:''};}}:undefined;
  const registration=createGeneratedSamOperations({
    defineSamOperation:x=>x,registerSamOperation:x=>operations.set(x.id,x),
    getSamOperation:id=>operations.get(id),resolveTrustedContext:async()=>identity,
    authorize:async()=>authorized,processRuntime:runtime,
  });
  const os={get:id=>operations.get(id)};
  return {client:new AgentSamClient({os,autoSeed:false}),calls,registration,operations};
}
test('sam.superbash is unavailable without an injected execution runtime',async()=>{
  const h=harness({bound:false});
  assert.equal(h.operations.has('sam.superbash'),false);
  assert.equal(h.registration.unavailable.find(x=>x.name==='sam.superbash')?.reason,'handler_not_bound');
  const result=await h.client.invoke('sam.superbash',{script:'printf harmless'});
  assert.equal(result.ok,false);
  assert.equal(result.error.code,'sam_operation_not_found');
});
test('AgentSamClient.invoke passes trusted lane and returns a real process receipt',async()=>{
  const h=harness();
  const result=await h.client.invoke('sam.superbash',{script:'printf harmless',relativeCwd:'.'});
  assert.equal(result.ok,true);
  assert.equal(result.data.executionId,'integration-fixture');
  assert.equal(result.data.exitCode,0);
  assert.ok(result.receipt.id);
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].laneRef,'test-owned-device');
  assert.equal(h.calls[0].accountId,'test-account');
});
test('authorization denies execution before process runtime is called',async()=>{
  const h=harness({authorized:false});
  const result=await h.client.invoke('sam.superbash',{script:'printf harmless'});
  assert.equal(result.ok,false);
  assert.equal(h.calls.length,0);
});
test('failed process is not a successful AgentSamClient result',async()=>{
  const h=harness({exitCode:3,status:'failed'});
  const result=await h.client.invoke('sam.superbash',{script:'exit 3'});
  assert.equal(result.ok,false);
  assert.equal(result.data.exitCode,3);
  assert.equal(result.error.code,'script_execution_failed');
});
