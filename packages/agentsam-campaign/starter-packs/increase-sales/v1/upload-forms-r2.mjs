/** R2 artifact uploader for the Campaign-owned /forms distribution.
 * Dry run by default. Requires an explicitly authenticated Cloudflare operator
 * to pass --publish; never embeds secrets or touches D1/merchant records.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const output=path.join(root,'forms-dist');
const manifest=JSON.parse(await fs.readFile(path.join(output,'manifest.json'),'utf8'));
const bucket=process.env.CAMPAIGN_R2_BUCKET || manifest.bucket;
const prefix=manifest.r2_prefix;
if(manifest.owner!=='@inneranimalmedia/agentsam-campaign' ||
   manifest.r2_prefix!=='forms/campaigns/increase-sales/v1/' ||
   manifest.distribution_file_count!==159) throw new Error('invalid_campaign_forms_manifest');
if(!/^[a-z0-9][a-z0-9-]{1,62}$/.test(bucket))throw new Error('invalid_campaign_r2_bucket');
const archiveName='agentsam-campaign-increase-sales-forms-v1.zip';
const entries=[
 {path:archiveName,key:prefix+archiveName,content_type:'application/zip',
  file:path.join(root,'release',archiveName)},
 ...manifest.files.map(f=>({...f,file:path.join(output,f.path)})),
 {path:'manifest.json',key:prefix+'manifest.json',content_type:'application/json',
  file:path.join(output,'manifest.json')}
];
const from=Number((process.argv.find(x=>x.startsWith('--from='))||'--from=0').split('=')[1]);
const count=Number((process.argv.find(x=>x.startsWith('--count='))||'--count=160').split('=')[1]);
if(!Number.isSafeInteger(from)||from<0||!Number.isSafeInteger(count)||count<1)throw new Error('invalid_campaign_r2_batch');
const chosen=entries.slice(from,from+count);
for(const f of chosen){
 const bytes=await fs.readFile(f.file);
 if(f.sha256&&createHash('sha256').update(bytes).digest('hex')!==f.sha256)
  throw new Error('campaign_forms_checksum_mismatch:'+f.path);
}
if(!process.argv.includes('--publish')){
 console.log(JSON.stringify({dry_run:true,bucket,prefix,total:entries.length,from,count:chosen.length}));
 process.exit(0);
}
async function put(f){
 return new Promise((resolve,reject)=>{
  const args=['r2','object','put',bucket+'/'+f.key,'--file',f.file,'--remote','--force','--content-type',f.content_type];
  const p=spawn('wrangler',args,{cwd:root,stdio:['ignore','pipe','pipe']});
  let output='';
  p.stdout.on('data',()=>{});
  p.stderr.on('data',d=>output+=d.toString());
  p.on('error',reject);
  p.on('close',code=>code===0?resolve():reject(new Error(f.key+':'+output.slice(-400))));
 });
}
let next=0,success=0;const failed=[];
async function worker(){
 for(;;){
  const i=next++;if(i>=chosen.length)return;
  const file=chosen[i];
  for(let attempt=1;attempt<=3;attempt++){
   try{await put(file);success++;break}
   catch(error){
    if(attempt===3)failed.push(String(error));
    else await new Promise(r=>setTimeout(r,attempt*500));
   }
  }
 }
}
await Promise.all(Array.from({length:4},worker));
console.log(JSON.stringify({uploaded:success,failed:failed.length,total:chosen.length,errors:failed}));
if(failed.length)process.exitCode=1;
