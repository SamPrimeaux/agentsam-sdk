/** Project-owned sink for the canonical site.scrape crawl; no shared account bucket. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { parse as parseJsonc } from 'jsonc-parser';
import { createSiteIndex } from './index.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const bucketPattern=/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const configs=['wrangler.jsonc','wrangler.json','wrangler.toml','wrangler.production.toml'];

export function resolveProjectStorage(projectRoot,{bucket:explicitBucket}={}) {
  const root=fs.realpathSync(projectRoot);
  if(!fs.statSync(root).isDirectory()) throw Error('projectRoot must be directory');
  let bucket=explicitBucket,source=explicitBucket?'explicit-user-selection':null;
  const cfg=path.join(root,'.agentsam','site-scrape.json');
  if(!bucket&&fs.existsSync(cfg)){
    const setting=JSON.parse(fs.readFileSync(cfg,'utf8')).storage?.evidence || {};
    if(setting.provider==='local') return {provider:'local',source:'project-local',projectRoot:root};
    if(setting.provider && setting.provider!=='r2') throw Error('unsupported project evidence provider');
    if(setting.bucket){bucket=setting.bucket;source='project:.agentsam/site-scrape.json';}
  }
  if(!bucket)for(const file of configs){
    const full=path.join(root,file);if(!fs.existsSync(full))continue;
    const text=fs.readFileSync(full,'utf8');let candidates=[];
    if(/\.jsonc?$/.test(file)) candidates=parseJsonc(text)?.r2_buckets||[];
    else {
      for(const chunk of text.split(/\[\[r2_buckets\]\]/).slice(1)) {
        const binding=chunk.match(/\bbinding\s*=\s*["']([^"']+)["']/)?.[1];
        const name=chunk.match(/\bbucket_name\s*=\s*["']([^"']+)["']/)?.[1];
        if(binding&&name)candidates.push({binding,bucket_name:name});
      }
    }
    const selected=candidates.find(b=>b.binding==='CRAWL_EVIDENCE');
    if(selected){bucket=selected.bucket_name;source=`wrangler:${file}:CRAWL_EVIDENCE`;break;}
  }
  if(bucket && !bucketPattern.test(bucket)) throw Error('invalid project-selected R2 bucket');
  return {provider:bucket?'r2':'local',bucket:bucket||null,source:source||'local-no-remote-default',projectRoot:root};
}

function metadataFile(root,filename,extra={}) {
  const contents=fs.readFileSync(path.join(root,filename));
  return {key:filename,sha256:'sha256:'+sha(contents),bytes:contents.length,
    content_type:filename.endsWith('.json')?'application/json':'application/octet-stream',...extra};
}
export function createLocalArchive({projectRoot,archiveDir,accountId,projectId}) {
  const root=fs.realpathSync(projectRoot);
  const output=path.resolve(archiveDir || path.join(root,'.agentsam','crawls'));
  fs.mkdirSync(output,{recursive:true,mode:0o700});
  const temp=fs.mkdtempSync(path.join(output,'.scrape-stage-'));
  const files=[],pageRecords=[];let index=0;
  const save=(relative,bytes,metadata={})=>{
    const outputFile=path.join(temp,relative);
    fs.mkdirSync(path.dirname(outputFile),{recursive:true});fs.writeFileSync(outputFile,bytes,{flag:'wx'});
    files.push(metadataFile(temp,relative,metadata));return relative;
  };
  return {
    onPage:async page=>{
      const relative=`pages/${String(++index).padStart(5,'0')}.json`;
      save(relative,Buffer.from(JSON.stringify(page,null,2)+'\n'),{kind:'page',source_url:page.url});
      pageRecords.push(page);
    },
    onAsset:async asset=>{
      const relative=`assets/${asset.sha256.slice(7)}`;
      if(!files.some(x=>x.key===relative))save(relative,asset.body,{kind:'image',source_url:asset.url,content_type:asset.contentType});
    },
    finalize(receipt){
      const account=accountId&&/^au_[A-Za-z0-9_-]{4,128}$/.test(accountId)?accountId:null;
      const project=projectId&&/^proj_[A-Za-z0-9_-]{3,128}$/.test(projectId)?projectId:null;
      if((accountId&&!account)||(projectId&&!project))throw Error('invalid account/project identity labels');
      const prefix=account&&project?`v1/accounts/${account}/projects/${project}/runs/${receipt.run_id}`:`runs/${receipt.run_id}`;
      const destination=path.join(output,prefix);
      if(fs.existsSync(destination)) throw Error('refusing to overwrite existing crawl run');
      fs.writeFileSync(path.join(temp,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
      files.push(metadataFile(temp,'receipt.json'));
      save('index.json',Buffer.from(JSON.stringify(createSiteIndex(pageRecords),null,2)+'\n'));
      const manifest={schema_version:1,kind:'agentsam.crawl-evidence.v1',visibility:'private',
        account_id:account,project_id:project,run_id:receipt.run_id,prefix,
        receipt_status:receipt.status,crawl_content_hash:receipt.content_hash,objects:files};
      fs.writeFileSync(path.join(temp,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
      fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
      fs.renameSync(temp,destination);
      return {root:destination,manifest};
    },
    discard(){if(fs.existsSync(temp))fs.rmSync(temp,{recursive:true,force:true});}
  };
}
export function verifyLocalArchive(archiveRoot) {
  const root=fs.realpathSync(archiveRoot),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  if(manifest.kind!=='agentsam.crawl-evidence.v1')throw Error('invalid crawl evidence manifest');
  if(manifest.account_id || manifest.project_id){
    if(!/^au_[A-Za-z0-9_-]{4,128}$/.test(manifest.account_id||'') || !/^proj_[A-Za-z0-9_-]{3,128}$/.test(manifest.project_id||'') ||
       manifest.prefix!==`v1/accounts/${manifest.account_id}/projects/${manifest.project_id}/runs/${manifest.run_id}`) throw Error('archive identity and prefix mismatch');
  }else if(manifest.prefix!==`runs/${manifest.run_id}`)throw Error('local archive run prefix mismatch');
  if(!/^scrp_[0-9a-f]{24}$/.test(manifest.run_id))throw Error('invalid archive run id');
  const keys=new Set();
  for(const item of manifest.objects){
    if(typeof item.key!=='string'||keys.has(item.key)||path.isAbsolute(item.key)||item.key.split('/').includes('..'))throw Error('duplicate or unsafe archive key');
    keys.add(item.key);
    const p=path.resolve(root,item.key);
    if(!p.startsWith(root+path.sep) || !fs.existsSync(p) || fs.realpathSync(p)!==p)throw Error('unsafe/missing archive key');
    const bytes=fs.readFileSync(p);
    if(bytes.length!==item.bytes||'sha256:'+sha(bytes)!==item.sha256)throw Error('evidence_checksum_mismatch:'+item.key);
  }
  if(!keys.has('receipt.json')||!keys.has('index.json'))throw Error('missing crawl receipt or index');
  const receipt=JSON.parse(fs.readFileSync(path.join(root,'receipt.json'),'utf8'));
  if(receipt.run_id!==manifest.run_id)throw Error('receipt_run_mismatch');
  return manifest;
}
/** Run one project-authorized Wrangler PUT without shell expansion. */
function putWithWrangler({file,key,bucket,projectRoot,wranglerConfig}) {
  return new Promise((resolve,reject)=>{
    const args=['wrangler','r2','object','put',`${bucket}/${key}`,'--file',file,'--remote'];
    if(wranglerConfig) args.push('-c',wranglerConfig);
    const child=spawn('npx',args,{cwd:projectRoot,stdio:['ignore','ignore','pipe']});
    let stderr='';
    child.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-450);});
    child.once('error',reject);
    child.once('close',code=>code===0?resolve():reject(new Error(`R2 upload failed: ${stderr || 'exit '+code}`)));
  });
}

/** The selected project's Wrangler environment performs every remote write.
 * Payloads upload with bounded concurrency; manifest uploads LAST. */
export async function uploadProjectArchive({archiveRoot,projectRoot,bucket,wranglerConfig,
                                           concurrency=4,put=putWithWrangler}) {
  const selection=resolveProjectStorage(projectRoot,{bucket});
  if(selection.provider!=='r2')throw Error('no project R2 crawl bucket selected; select one before uploading');
  if(!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>12)throw Error('invalid upload concurrency');
  const manifest=verifyLocalArchive(archiveRoot);
  if(!manifest.account_id||!manifest.project_id)throw Error('R2 evidence requires account and project identity');
  const entries=manifest.objects.map(f=>({file:path.join(archiveRoot,f.key),key:`${manifest.prefix}/${f.key}`}));
  let next=0, uploaded=0;const errors=[];
  await Promise.all(Array.from({length:Math.min(concurrency,entries.length)},async()=>{
    while(next<entries.length){
      const item=entries[next++];
      try{await put({...item,bucket:selection.bucket,projectRoot:selection.projectRoot,wranglerConfig});uploaded++;}
      catch(e){errors.push({key:item.key,error:e.message});}
    }
  }));
  if(errors.length)throw Error(`remote evidence incomplete: ${errors.length} object(s) failed; completion marker NOT uploaded: ${errors.map(e=>e.key).slice(0,3).join(', ')}`);
  const manifestKey=`${manifest.prefix}/manifest.json`;
  await put({file:path.join(archiveRoot,'manifest.json'),key:manifestKey,bucket:selection.bucket,
             projectRoot:selection.projectRoot,wranglerConfig});
  return {provider:'r2',bucket:selection.bucket,source:selection.source,uploaded:uploaded+1,manifest_key:manifestKey};
}
