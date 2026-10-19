import test from 'node:test';
import assert from 'node:assert/strict';
import {architecturalKnowledgeOps} from '../../../src/sam/operations/architectural-knowledge.js';
test('all five reference tools registered as typed SAM operations',()=>{
 assert.equal(architecturalKnowledgeOps.length,5);
 const ids=architecturalKnowledgeOps.map(o=>o.id);
 assert(ids.includes('arch.material.lookup'));
 assert(ids.includes('arch.capabilities.status'));
 for(const o of architecturalKnowledgeOps){
  assert.equal(o.execution.model,'never');
  assert.equal(o.execution.sideEffects,'none');
  assert.equal(o.execution.network,'none');
  assert(o.input_schema&&o.handler);
 }
});
test('SAM reference lookup returns scoped dimensions',async()=>{
 const op=architecturalKnowledgeOps.find(o=>o.id==='arch.material.lookup');
 const result=await op.handler({nominal:'2x4',condition:'surfaced_dry'});
 assert.equal(result.actual.width_in,3.5);
});
