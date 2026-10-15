import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openPlanLedger, getPlan, addPlanDependency } from '../../src/commands/plan-ledger.js';
import { invokePlanOperation } from '../../src/capabilities/plan-operations.js';
import { createCapabilityAdapter } from '../../src/agent/capability-adapter.js';

const cli = fileURLToPath(new URL('../../src/cli.js', import.meta.url));
function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-plan-portable-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  fs.writeFileSync(path.join(root, 'index.js'), 'export const answer=42;\n');
  return root;
}
function runCli(root, args) {
  return execFileSync(process.execPath, [cli, 'plan', ...args, '--cwd', root, '--json'],
    { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
}

test('a fresh git repository can inspect plans without config or filesystem writes', t => {
  const root=project(t);
  assert.equal(fs.existsSync(path.join(root,'.agentsam')),false);
  const listed=JSON.parse(runCli(root,['list']));
  assert.deepEqual(listed,[]);
  assert.equal(fs.existsSync(path.join(root,'.agentsam')),false);
  const next=JSON.parse(runCli(root,['next']));
  assert.equal(next.selection,'uninitialized');
  const show=JSON.parse(runCli(root,['show']));
  assert.equal(show,null);
  assert.equal(fs.existsSync(path.join(root,'.agentsam')),false);
});

test('durable Plan CRUD works in an existing uninitialized repo without implicit onboarding',t=>{
  const root=project(t);
  const created=JSON.parse(runCli(root,['new','Ship portable Plan','--goal','Prove ledger']));
  assert.equal(created.title,'Ship portable Plan');
  assert.equal(fs.existsSync(path.join(root,'.agentsam','config.json')),false);
  const added=JSON.parse(runCli(root,['add','Inspect contracts','--plan',created.id,'--acceptance','Evidence is attached']));
  assert.equal(added.status,'open');
  const next=JSON.parse(runCli(root,['next','--plan',created.id]));
  assert.equal(next.step.id,added.id);
  assert.equal(next.step.status,'open');
  assert.equal(JSON.parse(runCli(root,['list'])).length,1);
  assert.match(String(JSON.stringify(JSON.parse(runCli(root,['show',created.id])))),/Inspect contracts/);
  assert.throws(()=>invokePlanOperation('plan.step.status',{step_id:added.id,status:'complete'},root),/step_acceptance_incomplete/);
  invokePlanOperation('plan.step.evidence',{step_id:added.id,ref:'index.js',type:'file'},root);
  invokePlanOperation('plan.step.accept',{step_id:added.id,criterion:'Evidence is attached',evidence_ref:'index.js'},root);
  invokePlanOperation('plan.step.status',{step_id:added.id,status:'complete'},root);
  assert.equal(invokePlanOperation('plan.status',{plan_id:created.id,status:'complete'},root).status,'complete');
});

test('Plan and SAM GOAP share one model capability adapter with explicit approval',async t=>{
  const root=project(t);
  const denied=createCapabilityAdapter({projectRoot:root});
  const response=(await denied.invoke('capability.invoke',{capability_id:'plan.create',input:{title:'Should not exist'}})).result;
  assert.equal(response.error,'capability_not_authorized');
  assert.equal(fs.existsSync(path.join(root,'.agentsam')),false);
  const authorized=createCapabilityAdapter({projectRoot:root,
    authorizeCapability:async ({capability,risk})=>capability.id==='plan.create'&&risk==='write'});
  const result=(await authorized.invoke('capability.invoke',{capability_id:'plan.create',input:{title:'Operator-approved'}})).result;
  assert.equal(result.ok,true);
  assert.equal(result.result.title,'Operator-approved');
  const goap=await authorized.invoke('planning.goap',{initialState:{inspected:false,verified:false},
    goal:{verified:true},actions:[{id:'inspect',cost:1,preconditions:{inspected:false},effects:{inspected:true}},
      {id:'verify',cost:1,preconditions:{inspected:true},effects:{verified:true}}]});
  assert.equal(goap.result.ok,true);
  assert.deepEqual(goap.result.action_ids,['inspect','verify']);
  assert.ok(authorized.toolDescriptors().some(x=>x.name==='plan.next'));
});

test('custom shared SQLite does not expose plans and task ids between repository authorities',t=>{
  const a=project(t),b=project(t);
  const db=path.join(a,'shared.sqlite');
  for(const [root,id] of [[a,'local:a'],[b,'local:b']]){
    fs.mkdirSync(path.join(root,'.agentsam'),{recursive:true});
    fs.writeFileSync(path.join(root,'.agentsam','config.json'),JSON.stringify({repository:{id},local:{database:db}}));
  }
  const plan=invokePlanOperation('plan.create',{title:'Private to A'},a);
  const task=invokePlanOperation('plan.step.add',{plan_id:plan.id,title:'A task'},a);
  const ctx=openPlanLedger(b,{readOnly:true});
  try{assert.equal(getPlan(ctx,plan.id),null);}finally{ctx.close();}
  assert.equal(invokePlanOperation('plan.show',{plan_id:plan.id},b).plan,null);
  assert.throws(()=>invokePlanOperation('plan.step.status',{step_id:task.id,status:'running'},b),/step_not_found/);
});

test('dependency cycles and premature Plan completion are rejected',t=>{
  const root=project(t);
  const plan=invokePlanOperation('plan.create',{title:'Dependency acceptance'},root);
  const x=invokePlanOperation('plan.step.add',{plan_id:plan.id,title:'X'},root);
  const y=invokePlanOperation('plan.step.add',{plan_id:plan.id,title:'Y'},root);
  invokePlanOperation('plan.step.depends',{step_id:y.id,dependency_id:x.id},root);
  assert.throws(()=>invokePlanOperation('plan.step.depends',{step_id:x.id,dependency_id:y.id},root),/dependency_cycle_not_allowed/);
  assert.throws(()=>invokePlanOperation('plan.step.status',{step_id:y.id,status:'running'},root),/step_dependencies_incomplete/);
  assert.throws(()=>invokePlanOperation('plan.status',{plan_id:plan.id,status:'complete'},root),/plan_steps_incomplete/);
});
