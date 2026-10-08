import fs from 'node:fs';
import path from 'node:path';
import { resolveMachineBinary, spawnMachine } from '../commands/machine-binary.js';

export function machineAvailable() {
 return resolveMachineBinary().kind !== 'missing';
}
export function machineInspect(input={},projectRoot){
 const root=fs.realpathSync(projectRoot);
 const selected=path.resolve(root,input.path||'.');
 if(selected!==root && !selected.startsWith(root+path.sep))throw new Error('machine_target_outside_workspace');
 if(!fs.existsSync(selected))return {ok:false,error:'target_not_found',path:input.path};
 const real=fs.realpathSync(selected);
 if(real!==root && !real.startsWith(root+path.sep))throw new Error('machine_target_symlink_outside_workspace');
 const resolved=resolveMachineBinary();
 if(resolved.kind==='missing')return {ok:false,error:'machine_binary_missing',next:'agentsam machine install'};
 const argv=['inspect',real,'--json'];
 const result=spawnMachine(resolved,argv,{stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024});
 if(result.error)return {ok:false,error:'process_spawn_failed',message:result.error.message};
 if(result.status!==0)return {ok:false,error:'execution_failed',exit_code:result.status,stderr:String(result.stderr||'').slice(-1200)};
 try {return {ok:true,result:JSON.parse(String(result.stdout||'')),source:'agentsam-machine'};}
 catch{return {ok:false,error:'upstream_invalid_response',stderr:String(result.stderr||'').slice(-500)};}
}
