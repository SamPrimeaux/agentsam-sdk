import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createCapabilityAdapter} from '../../src/agent/capability-adapter.js';
import {AgentSamClient,createSamOS} from '../../src/sam/index.js';

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sam-crud-'));
  const approve=async()=>true;
  const adapter=createCapabilityAdapter({projectRoot:root,authorizeCapability:approve});
  const sam=new AgentSamClient({os:createSamOS(),cwd:root,capabilityAdapter:adapter,authorizeCapability:approve});
  return {root,adapter,sam,remove:()=>fs.rmSync(root,{recursive:true,force:true})};
}
async function perform(sam,id,input){
  const result=await sam.invoke(id,input);
  assert.equal(result.ok,true,id+': '+JSON.stringify(result.error));
  return result.data;
}
test('project full CRUD: create, get/list, edit with version, archive, restore and preserved files',async t=>{
  const f=fixture();t.after(f.remove);
  const init=await perform(f.sam,'project.create',{id:'my-project',name:'My Project'});
  assert.equal(init.revision,1);
  assert.ok(fs.existsSync(path.join(f.root,'projects/my-project/.agentsam/project.json')));
  fs.writeFileSync(path.join(f.root,'projects/my-project/hello.txt'),'keep original source');
  const list=await perform(f.sam,'project.list',{});
  assert.equal(list.projects.length,1);
  assert.equal((await perform(f.sam,'project.get',{id:'my-project'})).name,'My Project');
  const edited=await perform(f.sam,'project.edit',{id:'my-project',name:'Changed',expected_revision:1});
  assert.equal(edited.revision,2);
  const stale=await f.sam.invoke('project.edit',{id:'my-project',name:'Stale',expected_revision:1});
  assert.equal(stale.ok,false);
  const denied=await f.sam.invoke('project.delete',{id:'my-project',expected_revision:2});
  assert.equal(denied.ok,false);
  const gone=await perform(f.sam,'project.delete',{id:'my-project',confirm_id:'my-project',expected_revision:2});
  assert.equal((await perform(f.sam,'project.list',{})).projects.length,0);
  const restored=await perform(f.sam,'project.restore',{id:'my-project',restore_ref:gone.restore_ref});
  assert.equal(restored.revision,2);
  assert.equal(fs.readFileSync(path.join(f.root,'projects/my-project/hello.txt'),'utf8'),'keep original source');
  const escape=await f.sam.invoke('project.create',{id:'../other',name:'Escapes'});
  assert.equal(escape.ok,false);
});
test('project and sqlite operations have hard authorization gates even via adapter direct invoke',async t=>{
  const f=fixture();t.after(f.remove);
  const denied=createCapabilityAdapter({projectRoot:f.root,authorizeCapability:async()=>false});
  for(const id of ['project.create','agentsam_sqlite_create']){
    await assert.rejects(denied.invoke(id,{id:'no',name:'No'}),/capability_not_authorized/);
    const result=await denied.invoke('capability.invoke',{capability_id:id,input:{id:'no',name:'No'}});
    assert.equal(result.result.ok,false,id);
  }
  assert.equal(fs.existsSync(path.join(f.root,'projects/no')),false);
});
test('local SQLite creates a REAL isolated database, inspects, lists, archives and restores',async t=>{
  const f=fixture();t.after(f.remove);
  const created=await perform(f.sam,'agentsam_sqlite_create',{name:'first_db'});
  assert.equal(created.engine,'sqlite');
  const dbPath=path.join(f.root,created.path);
  assert.equal(fs.readFileSync(dbPath).subarray(0,16).toString('utf8'),'SQLite format 3\0');
  assert.equal((await perform(f.sam,'agentsam_sqlite_get',{name:'first_db'})).integrity,'ok');
  assert.equal((await perform(f.sam,'agentsam_sqlite_list',{})).databases.length,1);
  const original=await perform(f.sam,'agentsam_sqlite_get',{name:'first_db'});
  const staleRename=await f.sam.invoke('agentsam_sqlite_edit',{name:'first_db',new_name:'other_db',
    expected_bytes:original.bytes,expected_mtime_ms:original.mtime_ms+1});
  assert.equal(staleRename.ok,false);
  const rename=await perform(f.sam,'agentsam_sqlite_edit',{name:'first_db',new_name:'second_db',
    expected_bytes:original.bytes,expected_mtime_ms:original.mtime_ms});
  assert.equal(rename.name,'second_db');
  assert.equal((await perform(f.sam,'agentsam_sqlite_list',{})).databases[0].name,'second_db');
  const renameBack=await perform(f.sam,'agentsam_sqlite_edit',{name:'second_db',new_name:'first_db',
    expected_bytes:rename.bytes,expected_mtime_ms:rename.mtime_ms});
  assert.equal(renameBack.name,'first_db');
  assert.equal((await f.sam.invoke('agentsam_sqlite_create',{name:'first_db'})).ok,false);
  assert.equal((await f.sam.invoke('agentsam_sqlite_create',{name:'../external'})).ok,false);
  assert.equal((await f.sam.invoke('agentsam_sqlite_delete',{name:'first_db'})).ok,false);
  const archive=await perform(f.sam,'agentsam_sqlite_delete',{name:'first_db',confirm_name:'first_db'});
  assert.equal(fs.existsSync(dbPath),false);
  await perform(f.sam,'agentsam_sqlite_restore',{name:'first_db',restore_ref:archive.restore_ref});
  assert.equal((await perform(f.sam,'agentsam_sqlite_get',{name:'first_db'})).integrity,'ok');
});
test('Remote agentsam_d1_create requires an explicit customer installation provider and approval',async t=>{
  const f=fixture();t.after(f.remove);
  assert.equal(f.adapter.canInvoke('agentsam_d1_create'),false);
  assert.equal((await f.adapter.invoke('capability.status',{id:'agentsam_d1_create'})).result.readiness,'unavailable');
  const requests=[];
  const adapter=createCapabilityAdapter({
    projectRoot:f.root,
    authorizeCapability:async({capability})=>capability.id==='agentsam_d1_create',
    installationContext:{installationId:'customer-123',actorId:'actor-456'},
    provisionD1:async payload=>{requests.push(payload);return {ok:true,database_id:'4a39446d-a466-4fb7-8971-16e4bfb64f1c',receipt:'cloudflare-receipt'};},
  });
  const sam=new AgentSamClient({os:createSamOS(),cwd:f.root,capabilityAdapter:adapter,
    authorizeCapability:async()=>true});
  const result=await perform(sam,'agentsam_d1_create',{name:'customer-db',confirm_name:'customer-db'});
  assert.equal(result.database_id,'4a39446d-a466-4fb7-8971-16e4bfb64f1c');
  assert.equal(result.installation_id,'customer-123');
  assert.equal(requests[0].installation.actorId,'actor-456');
  const denied=await sam.invoke('agentsam_d1_create',{name:'x',account_id:'admin-cloudflare'});
  assert.equal(denied.ok,false);
  assert.equal(requests.length,1);
  const denyAdapter=createCapabilityAdapter({
    projectRoot:f.root,installationContext:{installationId:'customer-123',actorId:'actor-456'},
    provisionD1:async()=>{assert.fail('never called')},authorizeCapability:async()=>false,
  });
  await assert.rejects(denyAdapter.invoke('agentsam_d1_create',{name:'not-approved'}),/capability_not_authorized/);
});
