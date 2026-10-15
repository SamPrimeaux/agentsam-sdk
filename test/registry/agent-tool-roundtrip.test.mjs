import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createCapabilityAdapter} from '../../src/agent/capability-adapter.js';
import {runResponsesAgent,capabilityFunctionName} from '../../src/agent/responses-runner.js';
import {initRepository} from '../../src/knowledge/config.js';

test('fake LLM turns discover, describe, status, authorize and retrieve through real shared handlers',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-turn-roundtrip-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 execFileSync('git',['init','-q'],{cwd:root});
 fs.mkdirSync(path.join(root,'src'));
 fs.writeFileSync(path.join(root,'src/routing.js'),'export const routingAuthority = "canonical capability registry";\n');
 initRepository(root,{include:['src'],exclude:[],repositoryId:'roundtrip'});
 const approvals=[],preflights=[],events=[],observed=[];
 const adapter=createCapabilityAdapter({projectRoot:root,authorizeCapability:async request=>{
  approvals.push(request.capability.id);return true;
 }});
 assert.equal((await adapter.invoke('knowledge.index',{mode:'run',max_inputs:15})).result.ok,true);
 const steps=[
  ['capability.search',{query:'knowledge',type:'capability'}],
  ['capability.describe',{id:'knowledge.search'}],
  ['capability.status',{id:'knowledge.search'}],
  ['capability.invoke',{capability_id:'knowledge.search',input:{query:'routingAuthority',top_k:3,token_budget:2000}}],
 ];
 let step=0;
 const next=()=>{
  if(step===steps.length)return {response_id:'reply_5',output_text:'Found routingAuthority in src/routing.js',tool_calls:[],usage_snapshot:{current_context:{input_tokens:150},cumulative:{input_tokens:1000,output_tokens:80}}};
  const [name,args]=steps[step++];
  return {response_id:'reply_'+step,output_text:'',tool_calls:[{call_id:'call_'+step,name:capabilityFunctionName(name),arguments:JSON.stringify(args)}],
   usage_snapshot:{current_context:{input_tokens:150},cumulative:{input_tokens:step*200,output_tokens:step*20}}};
 };
 const provider={
  create:async params=>{
   const names=params.tools.map(row=>row.name);
   for(const name of steps.map(s=>s[0]))assert.ok(names.includes(capabilityFunctionName(name)),name);
   return next();
  },
  continueWithToolOutputs:async input=>{observed.push(input.toolOutputs?.[0]?.output);return next();},
 };
 const modelRecord={model_key:'openai:gpt-6-astra',provider:'openai',provider_model_id:'gpt-6-astra',availability:'available',
 context_window:null,capabilities:{responses:true},reasoning_efforts:['auto'],service_tiers:['default'],pricing:null,max_output_tokens:null};
 const result=await runResponsesAgent({
  provider,modelRecord,model:'openai:gpt-6-astra',capabilityAdapter:adapter,cwd:root,
  prompt:'Use capability.search capability.describe capability.status capability.invoke to retrieve routingAuthority indexed knowledge',
  instructions:'Use the available runtime only.',maxTools:8,maxToolRounds:6,
  beforeTool:async request=>{preflights.push(request.capability_id);return true;},
  onPreparedTurn:async params=>events.push(params),
 });
 assert.match(result.output_text,/routingAuthority/);
 assert.deepEqual(preflights,steps.map(s=>s[0]));
 assert.deepEqual(approvals,['knowledge.search']);
 assert.equal(events.length,1,'turn-one trace must be captured once');
 const last=JSON.parse(observed.at(-1));
 assert.ok(JSON.stringify(last).includes('routing.js'));
 assert.equal(last.result?.ok,true);
});
