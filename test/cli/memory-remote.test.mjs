import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runMemory } from '../../src/commands/memory.js';

function harness(result={ok:true,results:[]}) {
  const calls=[], writes=[];
  return {calls,writes,options:{
    write:s=>writes.push(s),
    resolveServer:async()=>({name:'inneranimalmedia', auth:{token:'NOT_PRINTABLE'}}),
    mcp:{
      listMcpTools:async()=>({tools:[{name:'agentsam_memory_search'},{name:'agentsam_memory_commit'}]}),
      callMcpTool:async(_server,name,args)=>{
        calls.push({name,args});
        return {ok:true,result:{structuredContent:result}};
      }
    }
  }};
}
test('doctor discovers existing remote memory tools without leaking OAuth tokens',async()=>{
  const h=harness();
  const r=await runMemory(['remote','doctor','--json'],h.options);
  assert.equal(r.ok,true);
  assert.equal(r.backend,'IAM_MAIN');
  assert.doesNotMatch(h.writes.join(''), /NOT_PRINTABLE/);
});
test('search passes semantic project scope but no caller-controlled account identity',async()=>{
  const h=harness({ok:true,results:[{memory_key:'decision:cms:authority'}]});
  await runMemory(['remote','search','CMS authority','--project-id','p1','--top-k','5'],h.options);
  assert.deepEqual(h.calls[0],{name:'agentsam_memory_search',args:{query:'CMS authority',top_k:5,project_id:'p1'}});
  await assert.rejects(()=>runMemory(['remote','search','query','--account-id','other'],h.options));
});
test('commit is a dry run by default and only --apply writes',async()=>{
  const h=harness({ok:true,memory_id:'m_1',revision:1});
  await runMemory(['remote','commit','--key','decision:cms:authority','--title','One authority',
    '--content','Source-backed choice','--source-ref','pr/123','--tags','cms,decision'],h.options);
  const one=h.calls[0].args;
  assert.equal(one.dry_run,true);
  assert.equal(one.memory_type,'decision');
  assert.equal(one.source_client,'mcp');
  assert.equal(one.source_ref,'pr/123');
  assert.deepEqual(one.tags,['cms','decision']);
  assert.match(one.idempotency_key,/^cli_[0-9a-f]{32}$/);
  await runMemory(['remote','commit','--key','decision:cms:authority','--title','One authority',
    '--content','Source-backed choice','--apply'],h.options);
  assert.equal(h.calls[1].args.dry_run,false);
  assert.equal(h.calls[1].args.idempotency_key,one.idempotency_key);
});
test('read file commits provenance without publishing the file directly',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'agentsam-memory-'));
  try {
    const file=path.join(dir,'decision.md');
    await writeFile(file,'## Accepted decision\nKeep canonical D1');
    const h=harness();
    await runMemory(['remote','commit','--key','decision:infra:d1','--title','Canonical D1','--file',file],h.options);
    assert.match(h.calls[0].args.content,/canonical D1/);
    assert.equal(h.calls[0].args.dry_run,true);
  }finally{ await rm(dir,{recursive:true,force:true}); }
});
test('backend errors fail closed, never pretending a memory was saved',async()=>{
  const h=harness();
  h.options.mcp.callMcpTool=async()=>({ok:false,error:'remote_unavailable'});
  await assert.rejects(()=>runMemory(['remote','search','query'],h.options),/remote_unavailable/);
});
test('invalid keys, empty input, and too-large top-k reject before remote writes',async()=>{
  const h=harness();
  await assert.rejects(()=>runMemory(['remote','commit','--key','foo','--title','oops','--content','x'],h.options),/memory_remote_key_format_invalid/);
  await assert.rejects(()=>runMemory(['remote','search','--top-k','21'],h.options),/memory_remote_query_or_key_required/);
  assert.equal(h.calls.length,0);
});

