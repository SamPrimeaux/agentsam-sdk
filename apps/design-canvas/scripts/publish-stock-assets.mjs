#!/usr/bin/env node
/**
 * Publish owner-provided Design Canvas stock documents to the existing Theme
 * Store R2 bucket. These are immutable stock SOURCE assets, NOT storefront
 * themes or live CMS components. No D1/site mutation occurs.
 *
 * Dry-run: node apps/design-canvas/scripts/publish-stock-assets.mjs
 * Publish & verify: node apps/design-canvas/scripts/publish-stock-assets.mjs --execute --verify
 */
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';

const run=promisify(execFile);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const stock=join(root,'public/sources/stock');
const bucket='theme-store';
const catalog=JSON.parse(await readFile(join(stock,'catalog.json'),'utf8'));
const execute=process.argv.includes('--execute');
const verify=process.argv.includes('--verify');
if(verify&&!execute)throw Error('--verify requires --execute');
if(catalog.schema!=='agentsam.platform-stock.v1'||catalog.storage!==bucket)
  throw Error('Unexpected stock/catalog schema or bucket');
const sha=blob=>createHash('sha256').update(blob).digest('hex');
const entries=[];
for(const item of catalog.items){
  if(!/^[a-z0-9-]+$/.test(item.slug)||!/^agentsam\.stock\.[a-z0-9-]+$/.test(item.id))
    throw Error('Invalid stock identity: '+item.slug);
  let foundMain=false;
  for(const file of item.files){
    if(!/^(?:vendor\/)?[A-Za-z0-9_.-]+$/.test(file.path) ||
        !/^cms\/design-stock\/v1\/[a-z0-9-]+\/[a-f0-9]{16}\/[A-Za-z0-9_./-]+$/.test(file.r2_key))
      throw Error('Unsafe stock filename or object key: '+file.path);
    const path=join(stock,item.slug,file.path);
    const bytes=await readFile(path);
    if(sha(bytes)!==file.sha256||bytes.length!==file.bytes ||
       file.r2_key!==`cms/design-stock/v1/${item.slug}/${file.sha256.slice(0,16)}/${file.path}`)
      throw Error('Stock integrity check failed: '+path);
    if(file.path===item.main_html){
      foundMain=true;
      if(file.sha256!==item.main_sha256)throw Error('Main source checksum mismatch');
    }
    entries.push({item,file,path});
  }
  if(!foundMain)throw Error('Missing main source: '+item.slug);
}
const contentType=p=>p.endsWith('.html')?'text/html; charset=utf-8':
  p.endsWith('.js')?'text/javascript; charset=utf-8':
  p.endsWith('.md')?'text/markdown; charset=utf-8':'application/octet-stream';
async function wrangler(args){
  const {stdout,stderr}=await run('wrangler',args,{cwd:root,maxBuffer:1024*1024,timeout:90000});
  return stdout+'\n'+stderr;
}
async function upload({item,file,path},temp,position,total){
  const key=bucket+'/'+file.r2_key;
  await wrangler(['r2','object','put',key,'--file',path,'--remote','--force',
    '--content-type',contentType(file.path)]);
  if(verify){
    const output=join(temp,'verify-'+position);
    await wrangler(['r2','object','get',key,'--file',output,'--remote']);
    if(sha(await readFile(output))!==file.sha256)throw Error('R2 roundtrip mismatch: '+file.r2_key);
    await rm(output,{force:true});
  }
  console.log(`[${position+1}/${total}] ${item.slug}/${file.path} ${verify?'uploaded+verified':'uploaded'}`);
}
const manifestBytes=Buffer.from(JSON.stringify(catalog,null,2)+'\n');
const manifestHash=sha(manifestBytes);
const manifestKey=`cms/design-stock/v1/catalog/${manifestHash.slice(0,16)}.json`;
if(!execute){
  console.log(JSON.stringify({ok:true,dry_run:true,bucket,assets:entries.length,
    stock_packages:catalog.items.length,bytes:entries.reduce((n,e)=>n+e.file.bytes,0),
    catalog_key:manifestKey},null,2));
  process.exit(0);
}
const temp=await mkdtemp(join(tmpdir(),'agentsam-stock-r2-'));
try {
  let index=0, failures=[];
  const worker=async()=>{
    while(index<entries.length){
      const i=index++;
      try{await upload(entries[i],temp,i,entries.length);}
      catch(error){
        console.error(`FAILED [${i+1}] ${entries[i].file.r2_key}: ${error.message}`);
        failures.push({key:entries[i].file.r2_key,error:String(error.message).slice(0,250)});
      }
    }
  };
  await Promise.all(Array.from({length:4},()=>worker()));
  if(failures.length){
    console.error(JSON.stringify({ok:false,failed:failures,total:entries.length}));
    process.exitCode=1;
  }else{
    const file=join(temp,'catalog.json');
    await writeFile(file,manifestBytes);
    await wrangler(['r2','object','put',bucket+'/'+manifestKey,'--file',file,
      '--remote','--force','--content-type','application/json']);
    if(verify){
      const output=join(temp,'catalog-verify.json');
      await wrangler(['r2','object','get',bucket+'/'+manifestKey,'--file',output,'--remote']);
      if(sha(await readFile(output))!==manifestHash)throw Error('Catalog R2 checksum mismatch');
    }
    console.log(JSON.stringify({ok:true,bucket,published_assets:entries.length,
      stock_packages:catalog.items.length,catalog_key:manifestKey,sha256:manifestHash,
      roundtrip_verified:verify},null,2));
  }
}finally{await rm(temp,{recursive:true,force:true})}
