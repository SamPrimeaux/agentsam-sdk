import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createMcpD1Bridge, MCP_D1_TOOLS } from '../../src/capabilities/mcp-d1-bridge.js';
import { createCapabilityAdapter } from '../../src/agent/capability-adapter.js';
import { buildAgentToolSurface } from '../../src/agent/responses-runner.js';

const UUID='9fd6ff92-e407-4b51-8b01-3c93f3845bb2';

test('without a connected MCP host D1 operations are declared but not advertised as executable',async t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-d1-noconnect-'));
 t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const bridge=createMcpD1Bridge({home});
 const adapter=createCapabilityAdapter({projectRoot:process.cwd(),mcpD1Bridge:bridge});
 assert.equal(bridge.available,false);
 assert.equal(adapter.toolDescriptors().some(row=>MCP_D1_TOOLS.includes(row.name)),false);
 const state=(await adapter.invoke('capability.status',{id:'agentsam_d1_query'})).result;
 assert.equal(state.agent_callable,false);
 assert.equal(state.reason,'mcp_d1_connection_not_configured');
});

test('authorized host invokes exact existing MCP D1 tool names through one adapter',async()=>{
 const calls=[], approvals=[];
 const bridge=createMcpD1Bridge({invokeTool:async(name,input)=>{
  calls.push({name,input});
  const response=name==='agentsam_cf_d1_list'
    ? {ok:true,result:[{uuid:UUID,name:'fuelnfreetime'}]}
    : {ok:true,results:[{name:'cms_pages',type:'table'}]};
  return {content:[{type:'text',text:JSON.stringify(response)}]};
 }});
 const adapter=createCapabilityAdapter({projectRoot:process.cwd(),mcpD1Bridge:bridge,
  authorizeCapability:async request=>{approvals.push({id:request.capability.id,risk:request.risk});return request.risk==='read';}});
 for(const name of MCP_D1_TOOLS)assert.ok(adapter.canInvoke(name),name);
 const list=await adapter.invoke('capability.invoke',{capability_id:'agentsam_cf_d1_list',input:{}});
 assert.equal(list.result.ok,true);
 assert.equal(list.result.result.result[0].name,'fuelnfreetime');
 const query=await adapter.invoke('capability.invoke',{capability_id:'agentsam_d1_query',input:{
  database_id:UUID,sql:"SELECT name,type FROM sqlite_schema LIMIT 2",params:[]}});
 assert.equal(query.result.ok,true);
 assert.equal(query.result.result.results[0].name,'cms_pages');
 const denied=await adapter.invoke('capability.invoke',{capability_id:'agentsam_d1_write',input:{
  database_id:UUID,sql:"UPDATE cms_pages SET title = 'WRONG'"}});
 assert.equal(denied.result.error,'capability_not_authorized');
 assert.deepEqual(calls.map(c=>c.name),['agentsam_cf_d1_list','agentsam_d1_query']);
 assert.deepEqual(approvals.map(x=>x.risk),['read','read','write']);
 assert.equal(adapter.toolDescriptors().find(x=>x.name==='agentsam_d1_delete').risk,'write');
 const surface=buildAgentToolSurface(adapter,'Find our real Cloudflare D1 databases and inspect CMS schema',{maxTools:12});
 assert.ok(surface.descriptors.some(t=>t.name==='agentsam_cf_d1_list'||t.name==='agentsam_d1_query'));
});

test('host MCP transport preserves SQL values and rejects invalid/missing IDs',async()=>{
 const calls=[];
 const bridge=createMcpD1Bridge({invokeTool:async(name,args)=>{calls.push({name,args});return {ok:true,result:{results:[]}};}});
 for(const input of [{sql:'SELECT 1'}, {database_id:'fuelnfreetime',sql:'SELECT 1'},
   {database_id:UUID,sql:''}, {database_id:UUID,sql:'SELECT 1',params:Array(101).fill(1)}])
  await assert.rejects(bridge.invoke('agentsam_d1_query',input),/invalid/);
 assert.equal(calls.length,0);
 await bridge.invoke('agentsam_d1_query',{database_id:UUID,sql:'SELECT ? AS n',params:[3]});
 assert.deepEqual(calls[0].args.params,[3]);
});

test('existing MCP server client is reused with its configured bearer and no new credentials',async t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-mcp-authority-'));
 t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const dir=path.join(home,'.agentsam','mcp');fs.mkdirSync(dir,{recursive:true});
 // Same schema written by src/mcp/authority.js; token is never added to outputs.
 const {writeMcpServer}=await import('../../src/mcp/authority.js');
 writeMcpServer('inneranimalmedia',{url:'https://mcp.inneranimalmedia.com/mcp',
  auth:{type:'bearer',token:'test-fixture-bearer'},clients:['agentsam']},{home});
 const calls=[];
 const bridge=createMcpD1Bridge({home,callTool:async(server,name,args)=>{
  calls.push({server,name,args});
  return {ok:true,result:{content:[{type:'text',text:'{"ok":true,"result":[]}'}]}};
 }});
 assert.equal(bridge.available,true);
 const r=await bridge.invoke('agentsam_cf_d1_list',{});
 assert.equal(r.ok,true);
 assert.equal(calls[0].server.auth.token,'test-fixture-bearer');
 assert.equal(calls[0].name,'agentsam_cf_d1_list');
 assert.doesNotMatch(JSON.stringify(r),/test-fixture-bearer/);
});

test('one model turn discovers and invokes remote D1 tools through the existing provider runner', async()=>{
 const {runResponsesAgent,capabilityFunctionName}=await import('../../src/agent/responses-runner.js');
 const remoteCalls=[], approvals=[], outputs=[];
 const bridge=createMcpD1Bridge({invokeTool:async(name,args)=>{
   remoteCalls.push(name);
   return {content:[{type:'text',text:JSON.stringify(name==='agentsam_cf_d1_list'
     ? {ok:true,result:[{uuid:UUID,name:'fuelnfreetime'}]}
     : {ok:true,results:[{name:'cms_pages',type:'table'}]})}]};
 }});
 const adapter=createCapabilityAdapter({projectRoot:process.cwd(),mcpD1Bridge:bridge,
   authorizeCapability:async request=>{approvals.push(request.capability.id);return request.risk==='read';}});
 const steps=[
  ['agentsam_cf_d1_list',{}],
  ['agentsam_d1_query',{database_id:UUID,sql:"SELECT name,type FROM sqlite_schema WHERE type='table' LIMIT 3"}],
 ];
 let step=0;
 const next=()=>{
   if(step>=steps.length)return {response_id:'r3',output_text:'The remote D1 has cms_pages',tool_calls:[],usage_snapshot:{current_context:{input_tokens:100},cumulative:{input_tokens:250,output_tokens:50}}};
   const [name,args]=steps[step++];
   return {response_id:'r'+step,output_text:'',tool_calls:[{call_id:'c'+step,name:capabilityFunctionName(name),arguments:JSON.stringify(args)}],usage_snapshot:{current_context:{input_tokens:100},cumulative:{input_tokens:150,output_tokens:20}}};
 };
 const provider={
   create:async input=>{
     const names=input.tools.map(t=>t.name);
     for(const name of steps.map(s=>s[0]))assert.ok(names.includes(capabilityFunctionName(name)),name);
     return next();
   },
   continueWithToolOutputs:async req=>{outputs.push(req.toolOutputs?.[0]?.output);return next();},
 };
 const modelRecord={model_key:'openai:test',provider:'openai',provider_model_id:'test',availability:'available',context_window:null,capabilities:{responses:true},reasoning_efforts:['auto'],service_tiers:['default'],pricing:null,max_output_tokens:null};
 const run=await runResponsesAgent({provider,modelRecord,model:'openai:test',capabilityAdapter:adapter,cwd:process.cwd(),prompt:'Find our real Cloudflare D1 databases and inspect CMS schema',instructions:'Use authorized remote tools',maxTools:8,maxToolRounds:4,
   beforeTool:async()=>true});
 assert.match(run.output_text,/cms_pages/);
 assert.deepEqual(remoteCalls,['agentsam_cf_d1_list','agentsam_d1_query']);
 assert.deepEqual(approvals,[],'direct model tools are approved in beforeTool, not via a second permission path');
 assert.ok(outputs.some(text=>String(text).includes('fuelnfreetime')));
 assert.ok(outputs.some(text=>String(text).includes('cms_pages')));
});
