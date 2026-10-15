/** Read-only, explicit Cloudflare D1 schema inventory through existing Wrangler. */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { discoverProjectStores } from './store-discovery.js';

const exec = promisify(execFile);
const integer = (value,label,min,max)=>{
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<min||n>max)throw new RangeError(`${label}_invalid`);
  return n;
};
function existingConfig(root,name){
  const base=fs.realpathSync(root);
  if(typeof name!=='string'||!name||path.isAbsolute(name))throw new Error('d1_config_must_be_relative');
  const abs=path.resolve(base,name);
  if(!abs.startsWith(base+path.sep)||!fs.existsSync(abs)||fs.realpathSync(abs)!==abs)
    throw new Error('d1_config_not_authorized');
  if(!/^wrangler\.(toml|jsonc|json)$/.test(path.basename(abs)))throw new Error('d1_config_not_wrangler');
  return abs;
}
function schemaRows(value){
  const blocks=Array.isArray(value)?value:[value];
  const entries=blocks.flatMap(block=>Array.isArray(block?.results)?block.results:
    Array.isArray(block?.result)?block.result:[]);
  if(entries.some(entry=>typeof entry?.name!=='string'||!['table','view'].includes(entry?.type)))
    throw new Error('d1_schema_invalid_response');
  return entries.map(row=>({name:row.name,type:row.type}));
}

export async function inspectRemoteD1Schema(root,options={},deps={}) {
  if(options.remote!==true)throw new Error('d1_remote_flag_required');
  const binding=String(options.binding||'DB');
  if(!/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(binding))throw new Error('d1_binding_invalid');
  const config=String(options.config||'wrangler.toml');
  const configPath=existingConfig(root,config);
  const limit=integer(options.limit??100,'d1_schema_limit',1,250);
  const offset=integer(options.offset??0,'d1_schema_offset',0,1_000_000);
  const environment=options.environment??null;
  if(environment!==null&&!/^[a-zA-Z0-9_-]{1,60}$/.test(environment))throw new Error('d1_environment_invalid');
  const inventory=await discoverProjectStores(root);
  const declared=inventory.candidates.find(c=>c.driver==='d1'&&c.binding===binding&&
    c.source===config&&(c.environment||null)===(environment||null));
  if(!declared?.name)throw new Error('d1_binding_not_declared_in_config');
  // This query is statically authored, never supplied by the model/user.
  const sql=`SELECT name, type FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT ${limit} OFFSET ${offset}`;
  const bin=deps.wrangler || (fs.existsSync(path.join(root,'node_modules/.bin/wrangler'))
    ? path.join(root,'node_modules/.bin/wrangler') : 'wrangler');
  const args=['d1','execute',declared.name,'--remote','--command',sql,'--json','--config',configPath];
  if(environment)args.push('--env',environment);
  const runner=deps.execFile || exec;
  let response;
  try{response=await runner(bin,args,{cwd:root,timeout:60000,maxBuffer:2*1024*1024,windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe']});}
  catch(error){throw new Error('d1_remote_schema_probe_failed:'+String(error?.code||'command_failed'));}
  let output;
  try{output=JSON.parse(response.stdout);}
  catch{throw new Error('d1_remote_schema_invalid_json');}
  if((Array.isArray(output)?output:[output]).some(row=>row?.success===false))
    throw new Error('d1_remote_schema_query_failed');
  const tables=schemaRows(output);
  return {schema:'agentsam.db.d1-schema.v1',driver:'d1',verified:true,remote:true,
    source:config,binding,database_name:declared.name,environment,offset,limit,
    count:tables.length,has_more:tables.length===limit,tables};
}
