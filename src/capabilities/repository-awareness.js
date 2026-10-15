/**
 * Bounded, read-only repository perception. Keep selected repo authorization in
 * the caller; never let model-supplied cwd silently change the active workspace.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { machineInspect } from './machine-inspect.js';
import { createRepositoryCrawl, findRefineryCandidates } from '../../packages/agentsam-repository/src/index.js';

const run = promisify(execFile);
const pythonRoot = fileURLToPath(new URL('../../python',import.meta.url));
const within = (a,b) => a===b || a.startsWith(b+path.sep);

export function authorizedRepository(candidate, roots) {
  const permitted = roots.map(r=>fs.realpathSync(r));
  if(typeof candidate!=='string' || !candidate.trim()) throw new Error('repository_path_required');
  if(!fs.existsSync(candidate)) throw new Error('repository_target_not_found');
  const target=fs.realpathSync(candidate);
  if(!permitted.some(r=>within(target,r))) throw new Error('repository_target_not_authorized');
  return target;
}

export async function repositoryIntelligence(input={},root){
 const churnDays=Number(input.churn_days ?? 30);
 if(!Number.isInteger(churnDays)||churnDays<1||churnDays>3650) throw new Error('repository_churn_days_invalid');
 const result=await run(process.platform==='win32'?'python':'python3',
  ['-B','-m','agentsam_sdk.repository.intelligence','--repo-root',fs.realpathSync(root),'--churn-days',String(churnDays),'--json'],
  {cwd:root,timeout:90000,maxBuffer:8*1024*1024,env:{...process.env,PYTHONPATH:[pythonRoot,process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)}});
 return JSON.parse(result.stdout);
}

export function repositoryCrawl(input={},root){
 const inspected=machineInspect({path:'.',run_id:input.run_id},root);
 if(!inspected.ok)return inspected;
 const graph=createRepositoryCrawl(inspected.result,{root:fs.realpathSync(root)});
 return {ok:true,graph,provenance:{source:'agentsam-machine',root}};
}

export function repositoryMine(input={},root,{allowedRoots=[root]}={}){
 if(!input.against)return {ok:false,error:'second_repository_required',next:'Specify a second authorized repository as against.'};
 const against=authorizedRepository(input.against,allowedRoots);
 if(against===fs.realpathSync(root))return {ok:false,error:'second_repository_must_differ'};
 const first=repositoryCrawl({run_id:input.run_id},root),second=repositoryCrawl({run_id:input.against_run_id},against);
 if(!first.ok)return first;
 if(!second.ok)return second;
 const limit=Number(input.limit??25);
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('repository_mine_limit_invalid');
 return {ok:true,...findRefineryCandidates([first.graph,second.graph],{limit})};
}
