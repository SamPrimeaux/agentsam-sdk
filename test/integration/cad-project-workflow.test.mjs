import test from 'node:test';
import assert from 'node:assert/strict';
import {runProjectWorkflow} from '../../src/lib/cad/project-workflows.js';
test('workflow halts on invalid validation and records no claimed effects',async()=>{
 let calls=0;await assert.rejects(runProjectWorkflow({execute:async()=>{calls++;return {valid:false,errors:['bad wall']};}},'cad.house_baseline',{project:{}}),/project_invalid/);assert.equal(calls,1);
});
test('edit workflow refuses stale expected revision before edit',async()=>{
 const calls=[];await assert.rejects(runProjectWorkflow({execute:async(name)=>{calls.push(name);return {revision:2,project:{id:'p'}};}},'cad.edit_preview',{project_id:'p',expected_revision:1,operation:{}}),/revision_conflict/);assert.deepEqual(calls,['design_project_get']);
});
