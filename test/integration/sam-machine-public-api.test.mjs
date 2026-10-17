import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentSamClient, createSamOS } from '../../src/sam/index.js';

function makeClient(extra={}){return new AgentSamClient({os:createSamOS(),cwd:process.cwd(),autoSeed:false,...extra});}

test('systematic autonomous machinery: source status never invents host/permission evidence',async()=>{
  const sam=makeClient();
  assert.equal((await sam.status('repository.inspect')).ready,true);
  const missing=await sam.status('cms.page.publish');
  assert.equal(missing.bound,false);
  assert.equal(missing.ready,false);
  assert.equal(missing.authorized,null);
  assert.equal((await sam.status('artifact.render')).readiness,'available');
  const fabricated=await sam.status('artifact.render',{evidence:[{operation:'artifact.render',ok:true,receipt:{id:'fake',status:'completed'}}]});
  assert.equal(fabricated.verified,false);
  const rendered=await sam.invoke('artifact.render',{title:'Trust boundary',summary:'Local evidence'});
  assert.equal(rendered.ok,true);
  const observed=await sam.status('artifact.render');
  assert.equal(observed.verified,true);
  assert.deepEqual(observed.evidence_refs,[rendered.receipt.id]);
});

test('decide evaluates the actual deterministic SAM kernel without model or permission grants',async()=>{
  const sam=makeClient();
  const result=await sam.decide({state:{facts:{'choose.intent':'inspect'}},questions:{
    intent:{type:'choose',options:['inspect','publish'],evaluator_hint:'deterministic'}
  }});
  assert.equal(result.answers.intent.value,'inspect');
  assert.equal(result.model_used,false);
  assert.ok(result.receipt);
  await assert.rejects(sam.decide({state:{},questions:{guess:{type:'choose',options:['inspect','publish'],evaluator_hint:'deterministic'}}}),/deterministic_unsupported/);
});

test('artifact.render returns usable HTML, Markdown, manifest and receipt; never silently writes files',async()=>{
  const sam=makeClient();
  const a=await sam.invoke('artifact.render',{
    title:'Repository audit',
    summary:'Evidence backed observation',
    findings:[{id:'F-1',title:'Safe data',detail:'Observed outcome',evidenceRefs:['receipt-1']}],
    steps:[{id:'P1',title:'Check integration',acceptance:'Live call with receipt'}],
    evidence:[{ref:'receipt-1',label:'SAM inspect receipt'}],
    sections:[{sku:'IA-SEC-HERO-01',heading:'Case-study hero',description:'Grid and media placement',assetRef:'asset-ref-1'}],
  });
  assert.equal(a.ok,true);
  assert.equal(a.data.verified,false);
  assert.equal(a.data.manifest.verified,false);
  assert.match(a.data.files['report.html'],/<!doctype html>/);
  assert.match(a.data.files['report.md'],/Structured wireframes/);
  assert.equal(a.receipt.status,'completed');
  const invalid=await sam.invoke('artifact.render',{title:'Invalid',findings:[{title:'Unsupported',evidenceRefs:['none']}],evidence:[]});
  assert.equal(invalid.ok,false);
});

test('artifact HTML escapes user-authored strings, no script injection or invented source',async()=>{
  const sam=makeClient();
  const result=await sam.invoke('artifact.render',{title:'<script>alert(1)</script>',summary:'<img src=x onerror=alert(1)>'});
  assert.equal(result.ok,true);
  assert.doesNotMatch(result.data.files['report.html'],/<script>/);
  assert.doesNotMatch(result.data.files['report.html'],/<img src=x/);
  assert.equal(result.data.verified,false);
});

test('ACP run facade stores only declared work; no made-up completed jobs or deliverables',async()=>{
  const calls=[];
  const control={
    async start(input){calls.push(input);return {run_id:'run_actual',status:'queued'};},
    async getRun(){return {id:'run_actual',status:'completed'};},
    async events(){return [{seq:1,eventType:'real.worker.completed'}];},
    async cancel(){return {ok:true};},
    async receipt(){return {id:'actual-receipt',status:'completed'};},
  };
  const sam=makeClient({controlPlane:control});
  const run=await sam.run({goal:'Audit CMS readiness',operations:['plan.list'],deliverables:{formats:['html','md']}});
  assert.equal(run.id,'run_actual');
  const done=await run.wait({maxAttempts:1});
  assert.equal(done.status,'completed');
  assert.deepEqual(done.deliverables,[]);
  assert.equal((await sam.events(run.id))[0].eventType,'real.worker.completed');
  assert.deepEqual(calls[0].metadata.requested_operations,['plan.list']);
  await assert.rejects(makeClient().run({goal:'fake run'}),/sam_acp_host_not_configured/);
});

test('real Local ACP starts a durable queue record with the canonical run_id shape',async t=>{
  const {mkdtempSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const {createAgentControlClient}=await import('../../src/acp/client.js');
  const cwd=mkdtempSync(join(tmpdir(),'sam-real-acp-'));
  t.after(()=>rmSync(cwd,{recursive:true,force:true}));
  const control=createAgentControlClient({cwd,local:true});
  const sam=makeClient({cwd,controlPlane:control});
  const handle=await sam.run({goal:'Inspect repository',operations:['repository.inspect']});
  assert.match(handle.id,/^arun_/);
  const state=await handle.get();
  assert.equal(state.status,'queued');
  const events=await handle.events();
  assert.ok(events.some(x=>x.eventType==='run.created'));
  await assert.rejects(handle.wait({maxAttempts:1}),/sam_run_wait_timeout/);
  const receipt=await control.receipt(handle.id);
  assert.equal(receipt.status,'queued');
  assert.equal(receipt.terminal,false);
});

test('isolated OS safely retains real direct operation execution',async()=>{
  const sam=makeClient();
  const found=await sam.discover({query:'artifact'});
  assert.equal(found.operations.some(x=>x.id==='artifact.render'),true);
  const desc=await sam.describe('artifact.render');
  assert.equal(desc.execution.sideEffects,'none');
  const r=await sam.invoke('artifact.render',{title:'Evidence pack',summary:'Verified'});
  assert.equal(r.ok,true);
});

test('AgentSamClient delegates discovered host capabilities through one doorway and denies unauthorised writes',async()=>{
  const calls=[];
  const rows=[
    {id:'external.read',domain:'database',description:'Read only',side_effects:'network-read',version:1},
    {id:'external.write',domain:'database',description:'Mutation',side_effects:'external-write',version:1},
  ];
  const host={
    list:()=>rows,
    canInvoke:id=>rows.some(x=>x.id===id),
    describe:id=>rows.find(x=>x.id===id),
    async invoke(id,input){calls.push({id,input});return {result:{ok:true,rows:[{id:1}]}};},
  };
  const sam=makeClient({capabilityAdapter:host});
  const discover=await sam.discover({query:'external'});
  assert.ok(discover.operations.some(x=>x.id==='external.read'));
  assert.equal((await sam.describe('external.read')).id,'external.read');
  const read=await sam.invoke('external.read',{filter:'my scope'});
  assert.equal(read.ok,true);
  assert.deepEqual(read.data.rows,[{id:1}]);
  const denied=await sam.invoke('external.write',{id:1});
  assert.equal(denied.ok,false);
  assert.equal(denied.error.code,'sam_host_approval_required');
  assert.deepEqual(calls.map(x=>x.id),['external.read']);
  assert.equal((await sam.status('external.read')).verified,true);
  assert.equal((await sam.status('external.read')).ready,true);
  assert.equal((await sam.status('external.write')).verified,false);
});

test('Host approval callback does not replace downstream authority',async()=>{
  let invoked=false;
  const host={
    list:()=>[{id:'test.write',domain:'workspace',side_effects:'filesystem-write'}],
    canInvoke:id=>id==='test.write',
    describe:()=>({id:'test.write',domain:'workspace',side_effects:'filesystem-write'}),
    async invoke(){invoked=true;return {result:{ok:false,error:'tenant_scope_denied'}};},
  };
  const sam=makeClient({capabilityAdapter:host,authorizeCapability:async()=>true});
  const result=await sam.invoke('test.write',{});
  assert.equal(invoked,true);
  assert.equal(result.ok,false);
  assert.equal(result.receipt.status,'failed');
  assert.equal((await sam.status('test.write')).verified,false);
});
