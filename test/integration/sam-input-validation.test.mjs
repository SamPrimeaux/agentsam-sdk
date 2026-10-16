import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentSamClient } from '../../src/sam/client.js';
import { createSamOS } from '../../src/sam/os.js';
import { createSamCapabilityAdapter } from '../../src/sam/model-adapter.js';

test('SAM rejects invalid inline input before handler execution on direct and model paths', async () => {
  let called = 0;
  const os = createSamOS({ core:false });
  os.install([{
    id:'fixture.validate',module:'fixture',action:'validate',summary:'Validate a parameter',
    execution:{lanes:['local'],model:'never',network:'none',sideEffects:'none'},
    risk:'read_only',
    input_schema:{type:'object',additionalProperties:false,properties:{quantity:{type:'integer',minimum:1}},required:['quantity']},
    async handler(input){called++;return {accepted:input.quantity};},
  }]);
  const sam = new AgentSamClient({os});
  const invalid=await sam.invoke('fixture.validate',{quantity:0});
  assert.equal(invalid.ok,false);
  assert.match(invalid.error.code,/below_minimum/);
  assert.equal(called,0);
  const unknown=await sam.invoke('fixture.validate',{quantity:1, accountId:'other'});
  assert.equal(unknown.ok,false);
  assert.match(unknown.error.code,/unknown_field/);
  assert.equal(called,0);
  const adapter=createSamCapabilityAdapter({os,client:sam,expose:['fixture.validate'],authorize:async()=>true});
  const denied=await adapter.invoke('fixture.validate',{quantity:'1'});
  assert.equal(denied.ok,false);
  assert.equal(called,0);
  const okay=await adapter.invoke('fixture.validate',{quantity:2});
  assert.equal(okay.ok,true);
  assert.equal(called,1);
  assert.equal(okay.data.accepted,2);
});

test('unresolved schema-file references remain unvalidated and hidden from model discovery', async () => {
  const os=createSamOS({core:false});
  os.install([{
    id:'fixture.legacy',module:'fixture',action:'legacy',summary:'Unresolved schema',
    execution:{lanes:['local'],model:'never',network:'none',sideEffects:'none'},
    risk:'read_only',input_schema:'protocol/sam/unknown.schema.json',
    handler:async ()=>({ok:true}),
  }]);
  const adapter=createSamCapabilityAdapter({os,expose:['fixture.legacy'],authorize:async()=>true});
  assert.deepEqual(adapter.toolDescriptors(),[]);
  const result=await new AgentSamClient({os}).invoke('fixture.legacy',{custom:true});
  assert.equal(result.ok,true,'legacy internal operation is not incorrectly declared validated');
});
