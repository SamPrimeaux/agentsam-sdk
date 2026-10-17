#!/usr/bin/env node
/**
 * Positive read-only acceptance through the public AgentSamClient.
 * No default database writes; never prints OAuth credentials.
 */
import { AgentSamClient, createSamOS } from '../../src/sam/index.js';
import { createCapabilityAdapter } from '../../src/agent/capability-adapter.js';

const argv=process.argv.slice(2);
const dbAt=argv.indexOf('--database');
const databaseId=dbAt<0?null:argv[dbAt+1];
if(databaseId && !/^[a-f\d-]{36}$/i.test(databaseId))throw new Error('sam_invalid_database_id');
const adapter=createCapabilityAdapter({projectRoot:process.cwd()});
const sam=new AgentSamClient({os:createSamOS(),cwd:process.cwd(),capabilityAdapter:adapter});
const initial=await sam.status('agentsam_cf_d1_list');
if(!initial.bound)throw new Error(initial.reason||'sam_mcp_list_unavailable');
const listed=await sam.invoke('agentsam_cf_d1_list',{});
if(!listed.ok)throw new Error(listed.error?.code||'sam_d1_list_failed');
const payload=listed.data?.['0']?.results||listed.data?.result||listed.data;
const databases=Array.isArray(payload)?payload:[];
let result=null;
if(databaseId){
  const query=await sam.invoke('agentsam_d1_query',{
    database_id:databaseId,sql:'SELECT 1 AS verified_read',
  });
  result={ok:query.ok,receipt:query.receipt?.id,
    rows:query.data?.['0']?.results||query.data?.result||null,
    error:query.ok?null:query.error?.code};
  if(!query.ok)process.exitCode=1;
}
process.stdout.write(JSON.stringify({schema:'sam.machine.live-mcp-check.v1',
  server:'inneranimalmedia',database_count:databases.length,
  database_names:databases.map(x=>x.name).filter(Boolean),
  list_receipt:listed.receipt?.id,read:result,
  note:'Read-only host-authorized operation; no mutation performed'},null,2)+'\n');
