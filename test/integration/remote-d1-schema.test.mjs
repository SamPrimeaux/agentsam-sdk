import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectRemoteD1Schema } from '../../src/knowledge/d1-schema.js';
import { runDb } from '../../src/commands/db.js';
import { createCapabilityAdapter } from '../../src/agent/capability-adapter.js';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-d1-probe-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'package.json'),'{}');
 fs.writeFileSync(path.join(root,'wrangler.toml'),`name='shop'
[vars]
PASSWORD='not-exposed'
[[d1_databases]]
binding='DB'
database_name='production-app'
[[env.preview.d1_databases]]
binding='DB'
database_name='preview-app'
`);
 return root;
}

test('remote D1 introspection uses static, read-only SQL and declared binding',async(t)=>{
 const root=fixture(t),calls=[];
 const execFile=async(bin,args)=>{
  calls.push({bin,args});
  return {stdout:JSON.stringify([{success:true,results:[{name:'cms_pages',type:'table'},{name:'cms_globals',type:'table'}]}])};
 };
 const result=await inspectRemoteD1Schema(root,{remote:true,binding:'DB',limit:20,offset:10},{wrangler:'wrangler',execFile});
 assert.equal(result.verified,true);
 assert.equal(result.database_name,'production-app');
 assert.deepEqual(result.tables.map(x=>x.name),['cms_pages','cms_globals']);
 assert.equal(calls.length,1);
 assert.ok(calls[0].args.includes('--remote'));
 assert.match(calls[0].args[calls[0].args.indexOf('--command')+1],/SELECT name, type FROM sqlite_schema/);
 assert.match(calls[0].args[calls[0].args.indexOf('--command')+1],/LIMIT 20 OFFSET 10/);
 assert.doesNotMatch(JSON.stringify(result),/PASSWORD|not-exposed/);
});

test('remote DB introspection cannot run implicitly or use an undeclared database',async(t)=>{
 const root=fixture(t);let invoked=0;
 const execFile=async()=>{invoked++;return {stdout:'[]'};};
 for(const options of [
  {binding:'DB'}, {remote:true,binding:'WRONG'}, {remote:true,binding:'DB',limit:100000},
  {remote:true,binding:'DB',config:'../other/wrangler.toml'},
 ])await assert.rejects(()=>inspectRemoteD1Schema(root,options,{execFile}),/required|not_declared|limit_invalid|relative|not_authorized/);
 assert.equal(invoked,0);
});

test('db schema --remote uses existing DB CLI and supports environment selection',async(t)=>{
 const root=fixture(t);let output='',runs=0;
 const result=await runDb(['schema','--remote','--binding','DB','--env','preview','--limit','2','--json'],{
  cwd:root,write:x=>{output+=x;},dbSchemaDeps:{wrangler:'wrangler',execFile:async()=>{runs++;return {stdout:JSON.stringify([{success:true,results:[{name:'orders',type:'table'}]}])};}},
 });
 assert.equal(result.database_name,'preview-app');
 assert.equal(result.has_more,false);
 assert.equal(runs,1);
 assert.equal(JSON.parse(output).tables[0].name,'orders');
});

test('model cannot read remote schema without host authorization',async(t)=>{
 const root=fixture(t);
 const agent=createCapabilityAdapter({projectRoot:root});
 assert.ok(agent.canInvoke('cloudflare.d1.schema'));
 const denied=(await agent.invoke('capability.invoke',{capability_id:'cloudflare.d1.schema',input:{binding:'DB'}})).result;
 assert.equal(denied.error,'capability_not_authorized');
 assert.equal(fs.existsSync(path.join(root,'.agentsam')),false);
});
