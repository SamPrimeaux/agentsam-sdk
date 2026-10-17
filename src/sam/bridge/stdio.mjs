#!/usr/bin/env node
/**
 * Restricted local SAM bridge for other-language clients.
 * Deliberately excludes terminal, remote database and write-capable ops.
 * Production remote/native clients must use their authorized host API.
 */
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { AgentSamClient } from '../client.js';
import { createSamOS } from '../os.js';

const READ_OPERATIONS = new Set(['repository.inspect','artifact.render','decision.evaluate']);
const sam = new AgentSamClient({os:createSamOS(),cwd:process.cwd(),autoSeed:false});
function insideRoot(input) {
  if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('sam_bridge_invalid_input');
  const root=realpathSync(process.cwd());
  const target=realpathSync(path.resolve(root,input.root||input.cwd||root));
  if(target!==root && !target.startsWith(root+path.sep))
    throw new Error('sam_bridge_path_outside_workspace');
  return {...input,root:target};
}
async function handle(request){
  if(!request || typeof request!=='object' || Array.isArray(request))throw new Error('sam_bridge_invalid_request');
  switch(request.method){
    case 'discover':{
      const query=request.query||{};
      const full=await sam.discover({...query,limit:1000});
      const permitted=full.operations.filter(x=>READ_OPERATIONS.has(x.id));
      const limit=Number.isInteger(query.limit)?Math.max(0,query.limit):20;
      return {ok:true,count:Math.min(limit,permitted.length),operations:permitted.slice(0,limit)};
    }
    case 'describe':
      if(!READ_OPERATIONS.has(request.id))throw new Error('sam_bridge_operation_not_allowed');
      return sam.describe(request.id);
    case 'status':
      if(!READ_OPERATIONS.has(request.id)){
        return {schema:'sam.capability.readiness.v1',id:request.id,declared:false,
          registered:false,bound:false,authorized:false,available:false,verified:false,
          ready:false,readiness:'unavailable',reason:'sam_bridge_operation_not_allowed'};
      }
      return sam.status(request.id);
    case 'decide':return sam.decide(request.input||{});
    case 'invoke':{
      if(!READ_OPERATIONS.has(request.id))throw new Error('sam_bridge_operation_not_allowed');
      const input=request.id==='repository.inspect'?insideRoot(request.input||{}):request.input||{};
      return sam.invoke(request.id,input);
    }
    default:throw new Error('sam_bridge_unknown_method');
  }
}
try{
  const input=readFileSync(0,'utf8');
  if(Buffer.byteLength(input)>1024*1024)throw new Error('sam_bridge_request_too_large');
  const result=await handle(JSON.parse(input));
  process.stdout.write(JSON.stringify({ok:true,result})+'\n');
}catch(error){
  process.stdout.write(JSON.stringify({ok:false,error:{code:error.code||error.message||'sam_bridge_error'}})+'\n');
  process.exitCode=1;
}
