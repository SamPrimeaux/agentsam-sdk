import test from 'node:test';
import assert from 'node:assert/strict';
import {SPAWN_POLICY_CONTRACT,evaluateSpawnBudgetV2} from '../dist/spawn-policy.js';
const permitted={maxCostPerSessionUsd:5,maxCostPerCallUsd:2,allowSubagentSpawn:true,allowFanoutExecution:true,maxSpawnDepth:2};
test('v2 refuses default-deny account policy rather than inheriting capabilities from agent profiles',()=>{
 assert.deepEqual(evaluateSpawnBudgetV2({policy:{...permitted,maxCostPerSessionUsd:null,allowSubagentSpawn:false}}),
   {ok:false,contract:SPAWN_POLICY_CONTRACT,reason:'subagent_spawn_disabled'});
 assert.equal(evaluateSpawnBudgetV2({policy:{...permitted,maxCostPerCallUsd:null}}).reason,'policy_lane_cost_cap_required');
});
test('v2 enforces server limits even when caller asks for higher spending',()=>{
 const result=evaluateSpawnBudgetV2({policy:permitted,requestedJobCapUsd:50,requestedLaneCapUsd:20});
 assert.deepEqual(result,{ok:true,contract:SPAWN_POLICY_CONTRACT,jobCapUsd:5,laneCapUsd:2});
});
test('v2 honors smaller caps and fails closed for over-depth and unresolved policy',()=>{
 assert.deepEqual(evaluateSpawnBudgetV2({policy:permitted,requestedJobCapUsd:1,requestedLaneCapUsd:.25}),
   {ok:true,contract:SPAWN_POLICY_CONTRACT,jobCapUsd:1,laneCapUsd:.25});
 assert.equal(evaluateSpawnBudgetV2({policy:null}).reason,'spawn_policy_unresolved');
 assert.equal(evaluateSpawnBudgetV2({policy:permitted,requestedDepth:3}).reason,'spawn_depth_exceeded');
 assert.equal(evaluateSpawnBudgetV2({policy:{...permitted,allowFanoutExecution:false}}).reason,'fanout_execution_disabled');
});
