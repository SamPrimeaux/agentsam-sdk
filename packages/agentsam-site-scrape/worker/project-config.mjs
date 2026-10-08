/** Generate a project-owned Cloudflare Queue/R2 Worker deployment, never a
 * platform default. Only the target project's Wrangler credentials may deploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveProjectStorage } from '../runtime/node-storage.mjs';

const RESOURCE = /^[a-z][a-z0-9-]{1,61}[a-z0-9]$/;
const SAFE_SERVICE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
function valid(name,label,expression=RESOURCE){
 if(!expression.test(name||''))throw Error(`${label} must be an explicit valid Cloudflare resource name`);
 return name;
}
export function projectWorkerPlan(projectRoot,{queueName,authorityService,cmsService,
                                          workerName,bucket}={}){
 const root=fs.realpathSync(projectRoot);
 const storage=resolveProjectStorage(root,{bucket});
 if(storage.provider!=='r2')throw Error('project must select its own private R2 crawl-evidence bucket');
 const projectConfig=path.join(root,'.agentsam','site-scrape.json');
 const configuration=fs.existsSync(projectConfig)?JSON.parse(fs.readFileSync(projectConfig,'utf8')):{};
 const worker=configuration.worker||{};
 const queue=valid(queueName||worker.queue,'queueName',SAFE_SERVICE);
 const authority=valid(authorityService||worker.authority_service,'authorityService',SAFE_SERVICE);
 const selectedWorker=valid(workerName||worker.name||`${queue}-worker`,'workerName',SAFE_SERVICE);
 const services=[{binding:'AUTHORIZER',service:authority}];
 const cms=cmsService||worker.cms_service;
 if(cms)services.push({binding:'CMS_PROMOTER',service:valid(cms,'cmsService',SAFE_SERVICE)});
 const wrangler={
  $schema:'https://json.schemastore.org/wrangler.json',
  name:selectedWorker,
  main:'./worker.mjs',
  compatibility_date:'2026-10-08',
  compatibility_flags:['nodejs_compat'],
  workers_dev:false,
  r2_buckets:[{binding:'CRAWL_EVIDENCE',bucket_name:storage.bucket}],
  queues:{
   producers:[{binding:'CRAWL_JOBS',queue}],
   consumers:[{queue,max_batch_size:1,max_batch_timeout:1,max_retries:5}],
  },
  services,
 };
 return {worker_name:selectedWorker,queue_name:queue,bucket:storage.bucket,
   storage_source:storage.source,authorizer:authority,cms_promoter:cms||null,
   wrangler,required_resources:['project-owned R2 bucket','Cloudflare Queue',
     'AUTHORIZER service implementing the permission contract',
     ...(cms?['CMS_PROMOTER for review/attachment']:[])]};
}
export function writeProjectWorker(projectRoot,options={}){
 const plan=projectWorkerPlan(projectRoot,options);
 const root=path.join(fs.realpathSync(projectRoot),'.agentsam','site-scrape-worker');
 const worker=path.join(root,'worker.mjs'),config=path.join(root,'wrangler.jsonc');
 if(fs.existsSync(worker)||fs.existsSync(config))throw Error('existing project scrape Worker scaffold; refusing overwrite');
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 fs.writeFileSync(worker,"// Project-owned Worker; implementation lives in installed AgentSam SDK.\nexport { default } from '@inneranimalmedia/agentsam-sdk/site-scrape/worker';\n",{flag:'wx'});
 fs.writeFileSync(config,JSON.stringify(plan.wrangler,null,2)+'\n',{flag:'wx'});
 return {...plan,config_path:config,worker_path:worker};
}
