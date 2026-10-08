import assert from 'node:assert/strict';
import test from 'node:test';
import { createCapabilityAdapter } from '../../src/agent/capability-adapter.js';

test('agent can search and describe real CLI/product capabilities without execution', async()=>{
 const adapter=createCapabilityAdapter({projectRoot:process.cwd()});
 const hits=(await adapter.invoke('capability.search',{query:'repository',type:'capability'})).result;
 assert.ok(hits.some(hit=>hit.id==='repository.snapshot'));
 const described=(await adapter.invoke('capability.describe',{id:'machine',type:'command'})).result;
 assert.equal(described.id,'machine');
 const unavailable=(await adapter.invoke('capability.status',{id:'security.scan'})).result;
 assert.equal(unavailable.agent_callable,false);
 assert.equal(unavailable.reason,'capability_handler_unavailable');
});
test('dynamic invocation is allowlisted and requires host authorization',async()=>{
 const adapter=createCapabilityAdapter({projectRoot:process.cwd()});
 const unknown=(await adapter.invoke('capability.invoke',{capability_id:'cloudflare.wrangler.native'})).result;
 assert.equal(unknown.error,'capability_not_allowlisted');
 const unapproved=(await adapter.invoke('capability.invoke',{capability_id:'repository.snapshot'})).result;
 assert.equal(unapproved.error,'capability_not_authorized');
});
test('outer adapter offers registry tools in model-facing tool descriptions',()=>{
 const adapter=createCapabilityAdapter({projectRoot:process.cwd()});
 for(const id of ['capability.search','capability.describe','capability.status','capability.invoke'])
  assert.ok(adapter.toolDescriptors().some(row=>row.name===id));
});

test('workspace editing and test execution are exposed through canonical tool declarations',()=>{
 const adapter=createCapabilityAdapter({projectRoot:process.cwd()});
 for(const id of ['workspace.read','workspace.write','terminal.exec','test.run'])
  assert.ok(adapter.canInvoke(id),id+' should have a real handler');
});
