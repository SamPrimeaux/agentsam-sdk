import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCapabilityAdapter } from '../../src/agent/capability-adapter.js';
import { discoverProjectCapabilities } from '../../src/agent/project-discovery.js';
import { initRepository } from '../../src/knowledge/config.js';

const repo=()=>fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-discovery-'));
const withRepo=async run=>{
 const root=repo();
 try{
  execFileSync('git',['init','-q'],{cwd:root});
  fs.mkdirSync(path.join(root,'src'));
  fs.writeFileSync(path.join(root,'src/hello.js'),'export function greet(){ return "hello from indexed source"; }\n');
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'sample',scripts:{deploy:'node scripts/project-deploy.js',test:'node --test'}},null,2));
  return await run(root);
 } finally { fs.rmSync(root,{recursive:true,force:true}); }
};

test('discovery never mutates existing Cloudflare / npm / Vectorize configuration',async()=>{
 await withRepo(async root=>{
  const wrangler='name="existing-worker"\n[[vectorize]]\nbinding="VECTORIZE"\n[[d1_databases]]\nbinding="DB"\n';
  fs.writeFileSync(path.join(root,'wrangler.toml'),wrangler);
  const before=fs.readdirSync(root).sort();
  const detected=discoverProjectCapabilities(root);
  assert.ok(detected.signals.some(x=>x.id==='vectorize'));
  assert.ok(detected.signals.some(x=>x.id==='deploy'));
  assert.ok(detected.suggestions.some(x=>x.id==='vectorize'&&/Reuse/.test(x.message)));
  const a=createCapabilityAdapter({projectRoot:root,authorizeCapability:async()=>true});
  const invoked=(await a.invoke('capability.invoke',{capability_id:'project.discover'})).result;
  assert.equal(invoked.ok,true);
  assert.ok(invoked.result.signals.some(x=>x.id==='vectorize'));
  assert.equal(detected.automatic_changes,false);
  assert.deepEqual(fs.readdirSync(root).sort(),before);
  assert.equal(fs.readFileSync(path.join(root,'wrangler.toml'),'utf8'),wrangler);
 });
});

test('model discovery and tools.search consume identical canonical registry',async()=>{
 await withRepo(async root=>{
  const adapter=createCapabilityAdapter({projectRoot:root});
  const input={query:'repository',type:'capability',limit:50};
  const search=(await adapter.invoke('capability.search',input)).result;
  const legacy=(await adapter.invoke('tools.search',input)).result;
  assert.deepEqual(search,legacy);
  assert.ok(search.some(x=>x.id==='repository.snapshot'&&x.agent_callable));
  const missing=(await adapter.invoke('capability.status',{id:'security.scan'})).result;
  assert.equal(missing.agent_callable,false);
  const desc=(await adapter.invoke('capability.describe',{id:'knowledge.search'})).result;
  assert.equal(desc.id,'knowledge.search');
 });
});

test('authorized invocation is bounded and includes actual runtime outcome',async()=>{
 await withRepo(async root=>{
  const denied=createCapabilityAdapter({projectRoot:root});
  assert.equal((await denied.invoke('capability.invoke',{capability_id:'repository.snapshot'})).result.error,'capability_not_authorized');
  const approved=createCapabilityAdapter({projectRoot:root,authorizeCapability:async({capability})=>capability.id==='context.resolve'});
  const result=(await approved.invoke('capability.invoke',{capability_id:'context.resolve',input:{
   objective:'Answer with bounded evidence',window_tokens:8192,
   items:[{kind:'repo',ref:'repo://fixture',content:'tiny fixture',priority:100}]
  }})).result;
  assert.equal(result.ok,true);
  assert.equal(result.capability_id,'context.resolve');
  assert.equal(result.result.items?.[0]?.ref,'repo://fixture');
 });
});

test('real local knowledge index and search reuse one generation with provenance',async()=>{
 await withRepo(async root=>{
  initRepository(root,{include:['src'],exclude:[],repositoryId:'fixture-repo'});
  const adapter=createCapabilityAdapter({projectRoot:root,authorizeCapability:async()=>true});
  const first=(await adapter.invoke('knowledge.index',{mode:'run',max_inputs:30,max_characters:50000})).result;
  assert.equal(first.ok,true);
  const lookup=(await adapter.invoke('knowledge.search',{query:'greet',top_k:5,token_budget:3000})).result;
  assert.ok(lookup.hits?.length>0,JSON.stringify(lookup).slice(0,600));
  assert.ok(lookup.hits.some(x=>JSON.stringify(x).includes('hello.js')));
 });
});

test('model cannot compare an unapproved second repository',async()=>{
 await withRepo(async root=>{
  const external=repo();
  try{
   const adapter=createCapabilityAdapter({projectRoot:root});
   const invoked=await adapter.invoke('repository.mine',{against:external});
   assert.fail('expected policy rejection: '+JSON.stringify(invoked));
  }catch(e){assert.match(String(e.message),/repository_target_not_authorized/);}
  finally{fs.rmSync(external,{recursive:true,force:true});}
 });
});
