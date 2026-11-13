#!/usr/bin/env node
/**
 * Scalable, immutable, deduplicated CMS stock source publisher.
 *
 * Default: dry run / inspect package and object counts.
 * --execute: upload missing content-addressed objects; verify SHA-256; then
 *            publish immutable version manifests; lastly publish the index.
 * Already published versions are immutable: mismatching bytes fail the run.
 *
 * Legacy v1 exports remain addressable but this publisher never writes there.
 */
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {
  STORAGE_BUCKET,createStockPackage,createStockIndex,
  validateStockSourceFile,sha256,stockContentType,
} from './stock-package-v2.mjs';

const run=promisify(execFile);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const stock=join(root,'public/sources/stock');
const catalog=JSON.parse(await readFile(join(stock,'catalog.json'),'utf8'));
const execute=process.argv.includes('--execute');
if(catalog.schema!=='agentsam.platform-stock.v1')throw Error('Unexpected source catalog');
const releasePackages=[];
const blobs=new Map();
for(const item of catalog.items) {
  const pkg=createStockPackage(item);
  releasePackages.push(pkg);
  for(const file of item.files){
    const bytes=await readFile(join(stock,item.slug,file.path));
    validateStockSourceFile(item,file,bytes);
    const record=pkg.manifest.files.find(entry=>entry.path===file.path);
    const stored=blobs.get(record.object_key);
    if(stored&&stored.sha256!==record.sha256)throw Error('blob_collision');
    if(!stored)blobs.set(record.object_key,{key:record.object_key,sha256:record.sha256,
      bytes,contentType:stockContentType(file.path)});
  }
}
const index=createStockIndex(releasePackages);
const rawFiles=catalog.items.reduce((n,item)=>n+item.files.length,0);
const totalBytes=catalog.items.reduce((n,item)=>n+item.files.reduce((sum,f)=>sum+f.bytes,0),0);
const uniqueBytes=[...blobs.values()].reduce((sum,blob)=>sum+blob.bytes.length,0);
const report={ok:true,dry_run:!execute,bucket:STORAGE_BUCKET,
  packages:releasePackages.length,file_references:rawFiles,
  unique_blobs:blobs.size,logical_bytes:totalBytes,stored_blob_bytes:uniqueBytes,
  savings_percent:Math.round(100*(1-uniqueBytes/totalBytes)),
  index_key:index.key,index_sha256:index.sha256};
if(!execute){console.log(JSON.stringify(report,null,2));process.exit(0);}

const temp=await mkdtemp(join(tmpdir(),'iam-cms-stock-v2-'));
const wrangler=async args=>{
  try{return await run('wrangler',args,{cwd:root,maxBuffer:1_000_000,timeout:90_000});}
  catch(error){error.message=String(error.stderr||error.message);throw error;}
};
let created=0,reused=0;
async function publishImmutable(key,bytes,contentType){
  const hash=sha256(bytes);
  const path=join(temp,'object-'+hash);
  try{
    await wrangler(['r2','object','get',STORAGE_BUCKET+'/'+key,'--remote','--file',path]);
    const existing=await readFile(path);
    if(sha256(existing)!==hash)throw Error('immutable_package_conflict: '+key);
    reused++;
    return;
  }catch(error){
    // Do not mistake authentication/network failures for absent objects.
    if(!/not found|does not exist|no such key|404|object not found/i.test(error.message))
      throw error;
  }
  const local=join(temp,'source-'+hash);
  await writeFile(local,bytes);
  await wrangler(['r2','object','put',STORAGE_BUCKET+'/'+key,
    '--file',local,'--remote','--force','--content-type',contentType]);
  await wrangler(['r2','object','get',STORAGE_BUCKET+'/'+key,'--remote','--file',path]);
  if(sha256(await readFile(path))!==hash)throw Error('r2_roundtrip_mismatch: '+key);
  created++;
}
async function parallel(items,limit,fn){
  let index=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
    while(index<items.length)await fn(items[index++]);
  }));
}
try{
  // Dependencies first. Every file reference points at a verified object.
  await parallel([...blobs.values()],4,entry=>publishImmutable(entry.key,entry.bytes,entry.contentType));
  // Version manifests are immutable and referenced by stable logical IDs.
  await parallel(releasePackages,4,pkg=>publishImmutable(pkg.key,pkg.bytes,'application/json'));
  // Index is written last; no dangling package dependency can be published.
  await publishImmutable(index.key,index.bytes,'application/json');
  console.log(JSON.stringify({...report,dry_run:false,created,reused,verified:true},null,2));
}finally{await rm(temp,{force:true,recursive:true});}
