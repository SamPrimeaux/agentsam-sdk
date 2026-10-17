#!/usr/bin/env node
/** Read/write CRUD acceptance in a disposable temp workspace only. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {AgentSamClient,createSamOS,createCapabilityAdapter} from '../../src/index.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sam-crud-'));
try{
  const authorizeCapability=async()=>true; // disposable fixture, never use in a real host
  const adapter=createCapabilityAdapter({projectRoot:root,authorizeCapability});
  const sam=new AgentSamClient({os:createSamOS(),cwd:root,capabilityAdapter:adapter,authorizeCapability});
  const execute=async(id,input)=>{
    const result=await sam.invoke(id,input);
    if(!result.ok)throw Error(id+': '+JSON.stringify(result.error));
    return result;
  };
  const created=await execute('project.create',{id:'demo',name:'Demo'});
  const local=await execute('agentsam_sqlite_create',{name:'demo_local'});
  const checked=await execute('agentsam_sqlite_get',{name:'demo_local'});
  const archive=await execute('project.delete',{id:'demo',confirm_id:'demo',expected_revision:1});
  await execute('project.restore',{id:'demo',restore_ref:archive.data.restore_ref});
  process.stdout.write(JSON.stringify({ok:true,scope:'ephemeral',
    project:created.data.id,sqlite:local.data.name,sqlite_integrity:checked.data.integrity,
    receipt_ids:[created.receipt.id,local.receipt.id,checked.receipt.id,archive.receipt.id]},null,2)+'\n');
}finally{fs.rmSync(root,{recursive:true,force:true});}
