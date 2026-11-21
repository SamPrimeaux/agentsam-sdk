import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { AGENTSAM_RESOURCE_REF, assertAgentSamResourceRef } from '../dist/resource-ref.js';

const schema=JSON.parse(readFileSync(new URL('../schemas/resource-ref.v1.schema.json',import.meta.url)));
const validate=new Ajv2020({strict:false}).compile(schema);

test('ResourceRef supports loose files, assets, scenes and optional project revisions',()=>{
  assert.equal(AGENTSAM_RESOURCE_REF,'agentsam.resource-ref.v1');
  for(const ref of [{kind:'file',mount:'work',path:'drawings/plan.ifc'},
    {kind:'asset',id:'asset-123'},{kind:'scene',id:'scene:123'},
    {kind:'project',id:'project-123'},{kind:'project',id:'project-123',revision:3}]){
    assert.doesNotThrow(()=>assertAgentSamResourceRef(ref));
    assert.equal(validate(ref),true,JSON.stringify(validate.errors));
  }
});
test('ResourceRef rejects traversal, undeclared fields and malformed revision',()=>{
  for(const ref of [{kind:'file',mount:'work',path:'../../etc/passwd'},
    {kind:'file',mount:'work',path:'/etc/passwd'},
    {kind:'file',mount:'work',path:'docs\\secret'},
    {kind:'file',mount:'work',path:'foo//bar'},
    {kind:'asset',id:'valid',root:'/tmp'},
    {kind:'project',id:'project',revision:0}]){
    assert.throws(()=>assertAgentSamResourceRef(ref));
    assert.equal(validate(ref),false);
  }
});
