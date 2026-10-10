import test from 'node:test';
import assert from 'node:assert/strict';
import {createScriptHandlers} from '../scripts.js';
const ctx={accountId:'acct_a',actorId:'au_a',installationId:'inst_a',authorizedLaneRef:'owned-device'};
test('save/get are separate from shell execution and version constrained by store',async()=>{
  const saved=[];const store={saveVersion:async args=>{saved.push(args);return {scriptId:'script-a',version:1}},getVersion:async()=>({scriptId:'script-a',script:'echo hi',version:1})};
  const h=createScriptHandlers({scriptStore:store});
  assert.ok(h['sam.script.save']);assert.ok(h['sam.script.get']);assert.equal(h['sam.superbash'],undefined);
  const s=await h['sam.script.save']({script:'echo hi'},ctx);
  assert.equal(s.version,1);assert.equal(saved[0].accountId,'acct_a');
});
test('superbash calls authorized injected ExecOS process runtime, model cannot pick lane',async()=>{
  const args=[];const h=createScriptHandlers({processRuntime:{executeScript:async a=>{args.push(a);return {executionId:'ex1',status:'completed',exitCode:0}}}});
  const out=await h['sam.superbash']({script:'echo safe',relativeCwd:'.'},ctx);
  assert.equal(out.executionId,'ex1');assert.equal(args[0].laneRef,'owned-device');assert.equal(args[0].actorId,'au_a');
});
test('nonzero exit is not success and missing identity cannot execute',async()=>{
  const h=createScriptHandlers({processRuntime:{executeScript:async()=>({executionId:'ex2',status:'failed',exitCode:3})}});
  await assert.rejects(h['sam.superbash']({script:'exit 3'},ctx),/script_execution_failed/);
  await assert.rejects(h['sam.superbash']({script:'pwd'},{}),/trusted_identity_required/);
});
