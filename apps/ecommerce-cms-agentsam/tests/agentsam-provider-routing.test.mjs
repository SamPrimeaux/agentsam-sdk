import { __setApplicationAccountId } from "../backend/lib/account-context.js";
__setApplicationAccountId("acct_test");
import test from 'node:test';
import assert from 'node:assert/strict';
import {getFallbackChain} from '../backend/agentsam/ai-registry.js';
import {executeOpenAiChat,runAgentSamAi} from '../backend/agentsam/ai-run.js';

const account='acct_test';
const row=(overrides={})=>({id:'test-'+Math.random().toString(16).slice(2), account_id:account,
  provider:'workers_ai',model_id:'@cf/test/general',display_name:'Test model',task_type:'text_generation',
  lane:'general',status:'active',priority:1,is_default:1,is_fallback:0,supports_tools:0,
  workflow_keys_json:'[]',routing_keywords_json:'[]',request_defaults_json:'{"max_tokens":128}',...overrides});
function db(rows) {
  return {prepare(sql) { return {bind(...params) { return {
    async all() {
      const [accountId,...filters]=params;
      if (!sql.includes('FROM agentsam_ai'))return {results:[]};
      return {results:rows.filter(r=>r.account_id===accountId && filters.includes(r.status) &&
        (!sql.includes('task_type = ?') || filters.includes(r.task_type)))};
    },
    async first(){return {n:0}},
    async run(){return {success:true}},
  }; }}; }};
}

test('D1 primary (is_fallback=0) is never omitted; alternate fallback lanes survive',async()=>{
 const rows=[row({model_id:'@cf/primary',lane:'general',is_fallback:0}),
   row({model_id:'@cf/alternate',lane:'fast',priority:25,is_default:0,is_fallback:1})];
 const chain=await getFallbackChain({DB:db(rows)},{task_type:'text_generation',lane:'general'});
 assert.deepEqual(chain.map(m=>m.model_id),['@cf/primary','@cf/alternate']);
});

test('account default standard-lane model precedes conversational general-lane fallbacks',async()=>{
 const rows=[row({model_id:'@cf/default',lane:'standard',is_default:1,is_fallback:0}),
   row({model_id:'@cf/general',lane:'general',priority:10,is_default:0,is_fallback:1}),
   row({provider:'openai',model_id:'gpt-fallback',lane:'general',priority:40,is_default:0,is_fallback:1})];
 const models=await getFallbackChain({DB:db(rows)},{task_type:'text_generation',lane:'general'});
 assert.deepEqual(models.map(m=>m.model_id),['@cf/default','@cf/general','gpt-fallback']);
});

test('OpenAI-only project configuration returns a real response, not a Workers stub',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,async json(){return {output_text:'Ready without Workers AI'}}});
 try{
  const env={DB:db([row({provider:'openai',model_id:'gpt-selected-in-d1',is_default:1})]),OPENAI_API_KEY:'test-only'};
  const answer=await runAgentSamAi(env,'System','Hello',{task_type:'text_generation',lane:'general'});
  assert.equal(answer.ok,true,answer.error);
  assert.equal(answer.reply,'Ready without Workers AI');
 }finally{globalThis.fetch=old;}
});

test('optional tool list does not eliminate text models; Workers AI can answer without tools',async()=>{
 const calls=[];
 const env={DB:db([row()]),AGENTSAM_WAI:{async run(name,payload){calls.push({name,payload});return {response:'Reviewable advice, not a saved edit'};}}};
 const result=await runAgentSamAi(env,'You advise, do not save','Can you improve this?',{
   task_type:'text_generation',lane:'general',tool_definitions:[{name:'unsafe-write',description:'write'}]});
 assert.equal(result.ok,true,result.error);
 assert.match(result.reply,/Reviewable advice/);
 assert.equal(calls.length,1);
 assert.equal(calls[0].payload.tools,undefined,'non-tool-capable model cannot receive tool calls');
});

test('registered OpenAI provider uses the project secret and official Responses API',async()=>{
 const old=globalThis.fetch;
 let inspected;
 globalThis.fetch=async(url,options)=>{
  inspected={url,body:JSON.parse(options.body),authorization:options.headers.authorization};
  return {ok:true,async json(){return {output:[{type:'message',content:[{type:'output_text',text:'OpenAI generated a review'}]}]}}};
 };
 try{
  const out=await executeOpenAiChat({OPENAI_API_KEY:'fake-test-key'},
   {provider:'openai',model_id:'gpt-test-from-registry'},'Be helpful','Review this section',{},
   {max_tokens:140});
  assert.equal(out.reply,'OpenAI generated a review');
  assert.equal(inspected.url,'https://api.openai.com/v1/responses');
  assert.equal(inspected.body.model,'gpt-test-from-registry');
  assert.equal(inspected.body.max_output_tokens,140);
  assert.equal(inspected.authorization,'Bearer fake-test-key');
 }finally{globalThis.fetch=old}
});

test('OpenAI fallback is selected after failed Workers AI, with no global credential fallback',async()=>{
 const old=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,async json(){return {output_text:'Fallback response'};}}};
 const rows=[row({model_id:'@cf/fails',is_default:1,is_fallback:0}),
  row({provider:'openai',model_id:'gpt-test-fallback',lane:'general',priority:80,is_default:0,is_fallback:1})];
 try {
  const env={DB:db(rows),OPENAI_API_KEY:'fake-credential',AGENTSAM_WAI:{async run(){throw Error('Worker model unavailable')}}};
  const result=await runAgentSamAi(env,'System','Review this site',{task_type:'text_generation',lane:'general',tool_definitions:[]});
  assert.equal(result.ok,true,result.error);
  assert.equal(result.reply,'Fallback response');
  assert.equal(result.fallback_used,true);
  assert.deepEqual(result.attempted_models.map(m=>m.ok),[false,true]);
  assert.equal(calls.length,1);
  assert.equal(calls[0].body.model,'gpt-test-fallback');
 }finally{globalThis.fetch=old;}
});

test('OpenAI HTTP errors do not expose provider response bodies or secrets',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>({ok:false,status:401,async text(){return 'sensitive-body';}});
 try {
  await assert.rejects(executeOpenAiChat({OPENAI_API_KEY:'private'},
   {provider:'openai',model_id:'gpt-test'},'system','user',{},{}),
   error=>error.message==='openai_responses_http_401');
 }finally{globalThis.fetch=old;}
});
