import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentSamClient } from '../../src/sam/client.js';
import { defineSamOperation } from '../../src/sam/define.js';
import { registerSamOperation } from '../../src/sam/registry.js';

test('SAM never upgrades a structured handler failure to success', async () => {
  registerSamOperation(defineSamOperation({
    id: 'fixture.return-failure', module:'fixture', action:'return-failure',
    summary: 'Failure fixture', risk: 'read_only',
    execution: { lanes:['local'], model:'never', network:'none', sideEffects:'none' },
    handler: async () => ({ ok:false, error:{code:'resource_conflict',message:'Revision changed'} }),
  }));
  const result=await new AgentSamClient().invoke('fixture.return-failure',{});
  assert.equal(result.ok,false);
  assert.equal(result.error.code,'resource_conflict');
  assert.equal(result.receipt.status,'failed');
  assert.equal(result.receipt.output_hash,null);
});
