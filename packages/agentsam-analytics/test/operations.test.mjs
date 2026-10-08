import test from 'node:test';
import assert from 'node:assert/strict';
import { recordOperation, serializeOperationEvent } from '../dist/operations.js';

test('Analytics Engine schema has stable positional fields and no raw user content',()=>{
 const input={workspaceId:'merchant-1',domain:'cms',operation:'section.generate',outcome:'failed',durationMs:12,retries:1,errorCode:'schema_contract_mismatch',provider:'cloudflare',model:'worker-model'};
 const receipt=serializeOperationEvent(input);
 assert.equal(receipt.index,'merchant-1');
 assert.deepEqual(receipt.blobs.slice(0,4),['agentsam.operation.v1','cms','section.generate','failed']);
 assert.deepEqual(receipt.doubles.slice(0,2),[12,0]);
 assert.equal(receipt.blobs.length,8);
 assert.equal(receipt.doubles.length,6);
});
test('optional binding does not fabricate telemetry',()=>{
 assert.equal(recordOperation(undefined,{workspaceId:'a',domain:'cms',operation:'publish',outcome:'success'}).recorded,false);
 let point;
 const x=recordOperation({writeDataPoint:(p)=>{point=p;}},{workspaceId:'a',domain:'cms',operation:'publish',outcome:'success'});
 assert.equal(x.recorded,true);
 assert.equal(point.blobs[3],'success');
});
