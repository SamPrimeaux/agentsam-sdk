import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractHtml, crawlSite, robotsAllowed } from '../core.mjs';
import { assertPublicUrl, isPublicAddress, createSecureFetch } from '../secure-fetch.mjs';
import { resolveProjectStorage, createLocalArchive, verifyLocalArchive } from '../node-storage.mjs';
import { runNativeSiteScrape } from '../node-runner.mjs';

function response(url,body,status=200,contentType='text/html') {
 return {url,status,contentType,body:Buffer.from(body)};
}
const site='https://example.com/';
const mockPages={
 [site]:'<html><head><title>Home</title><meta name="description" content="Test"/></head><body><h1>Welcome</h1><nav><a href="/about">About</a></nav><img src="/hero.png" alt="Hero"></body></html>',
 'https://example.com/about':'<html><title>About</title><h2>Who we are</h2><a href="/">Home</a><a href="https://other.example.net/">Other</a></html>'
};
const stub=async (url)=>{
 if(url==='https://example.com/robots.txt')return response(url,'User-agent: *\nDisallow: /secret',200,'text/plain');
 if(url==='https://example.com/hero.png')return response(url,'image-content',200,'image/png');
 if(mockPages[url])return response(url,mockPages[url]);
 return response(url,'not found',404);
};

test('parse HTML semantics and deduplicate links/images',()=>{
 const parsed=extractHtml(mockPages[site],site);
 assert.equal(parsed.title,'Home');assert.equal(parsed.meta.description,'Test');
 assert.deepEqual(parsed.links.map(a=>a.url),['https://example.com/about']);
 assert.deepEqual(parsed.images.map(a=>a.url),['https://example.com/hero.png']);
 assert.equal(parsed.content[0].kind,'h1');
});

test('robots group applies allow before disallow and blocks secret',()=>{
 assert.equal(robotsAllowed('User-agent: *\nDisallow: /private\nAllow: /private/public','https://example.com/private/public'),true);
 assert.equal(robotsAllowed('User-agent: *\nDisallow: /private','https://example.com/private/data'),false);
});

test('crawl is bounded and emits canonical receipt with image evidence callbacks',async()=>{
 const pages=[],assets=[];
 const rec=await crawlSite({url:site,maxPages:2,concurrency:2,captureAssets:true,fetchPage:stub,
  onPage:p=>pages.push(p),onAsset:a=>assets.push(a),clock:()=>1000});
 assert.equal(rec.capability,'site.scrape');assert.equal(rec.status,'completed');
 assert.equal(rec.counts.pages_fetched,2);assert.equal(rec.counts.images_fetched,1);
 assert.equal(pages.length,2);assert.equal(assets.length,1);
 assert.equal(rec.runtime,'node-local');assert.ok(/^sha256:[0-9a-f]{64}$/.test(rec.content_hash));
});

test('robots is fail-closed when it cannot be fetched',async()=>{
 const rec=await crawlSite({url:site,fetchPage:async()=>{throw Error('network unavailable');}});
 assert.equal(rec.status,'failed');assert.equal(rec.counts.pages_fetched,0);
 assert.equal(rec.errors[0].kind,'blocked');
});

test('non-public address, internal host, DNS rebinding targets rejected',()=>{
 for(const ip of ['127.0.0.1','10.2.3.4','192.168.1.2','172.18.1.2','169.254.169.254','100.64.0.1','::1','fd00::1','::ffff:127.0.0.1']){
  assert.equal(isPublicAddress(ip),false,ip);
 }
 for(const value of ['http://localhost/','http://127.0.0.1:4321/','https://metadata.google.internal/','file:///etc/passwd']){
  assert.throws(()=>assertPublicUrl(value));
 }
 assert.equal(isPublicAddress('1.1.1.1'),true);
});

test('manual redirects refuse leaving the selected site before making second request',async()=>{
 let calls=0;
 const worker=createSecureFetch({seedUrl:site,fetchImpl:async()=>{
   calls++;return {status:301,headers:new Headers({location:'http://127.0.0.1/admin'}),body:{cancel:async()=>{}}};
 }});
 await assert.rejects(worker.fetchPage(site),/blocked non-public IP/);
 assert.equal(calls,1);await worker.close();
});

test('project chooses its own storage; no publisher bucket fallback',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-project-storage-'));
 try {
  assert.equal(resolveProjectStorage(root).provider,'local');
  fs.writeFileSync(path.join(root,'wrangler.jsonc'),'// mine\n{"r2_buckets":[{"binding":"CRAWL_EVIDENCE","bucket_name":"my-own-crawl-bucket"},{"binding":"WEBSITE_ASSETS","bucket_name":"my-site-assets"}]}');
  assert.equal(resolveProjectStorage(root).bucket,'my-own-crawl-bucket');
  assert.equal(resolveProjectStorage(root,{bucket:'selected-other-bucket'}).bucket,'selected-other-bucket');
  fs.mkdirSync(path.join(root,'.agentsam'));
  fs.writeFileSync(path.join(root,'.agentsam','site-scrape.json'),JSON.stringify({storage:{evidence:{provider:'local'}}}));
  assert.equal(resolveProjectStorage(root).provider,'local');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('durable archive checksum protects extracted pages after crawl',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-node-crawl-'));
 try {
  const archive=createLocalArchive({projectRoot:root,accountId:'au_testaccount123',projectId:'proj_test123'});
  const receipt=await crawlSite({url:site,maxPages:1,fetchPage:stub,onPage:archive.onPage,onAsset:archive.onAsset});
  const {root:location,manifest}=archive.finalize(receipt);
  assert.equal(verifyLocalArchive(location).objects.length,3);
  assert.match(manifest.prefix,/^v1\/accounts\/au_testaccount123\/projects\/proj_test123\/runs\/scrp_/);
  const index=JSON.parse(fs.readFileSync(path.join(location,'index.json'),'utf8'));
  assert.equal(index.schema,'agentsam.site.index.v1');
  assert.equal(index.counts.pages,1);
  fs.appendFileSync(path.join(location,'pages/00001.json'),'tamper');
  assert.throws(()=>verifyLocalArchive(location),/checksum/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('remote upload fails closed without project destination or account identity',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-node-runner-'));
 try {
  let output='',error='';
  const code=await runNativeSiteScrape(['scrape',site,'--project-root',root,'--upload-archive'],{
   stdout:{write:s=>output+=s},stderr:{write:s=>error+=s},cwd:root});
  assert.equal(code,2);assert.match(error,/authorized account\/project identity/);assert.equal(output,'');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('native project R2 uploader requires per-project selection and uploads completion marker last',async()=>{
 const { uploadProjectArchive }=await import('../node-storage.mjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-project-r2-'));
 try {
  const archive=createLocalArchive({projectRoot:root,accountId:'au_testaccount123',projectId:'proj_test123'});
  const receipt=await crawlSite({url:site,maxPages:1,fetchPage:stub,onPage:archive.onPage});
  const staged=archive.finalize(receipt);
  const written=[];
  const result=await uploadProjectArchive({archiveRoot:staged.root,projectRoot:root,bucket:'my-project-crawls',concurrency:2,
    put:async item=>{written.push(item);}});
  assert.equal(result.bucket,'my-project-crawls');assert.equal(result.uploaded,4);
  assert.match(written.at(-1).key,/\/manifest.json$/);
  assert.ok(written.every(item=>item.bucket==='my-project-crawls'));
  const errorWrites=[];
  await assert.rejects(uploadProjectArchive({archiveRoot:staged.root,projectRoot:root,bucket:'my-project-crawls',
    put:async item=>{errorWrites.push(item);if(item.key.endsWith('/index.json'))throw Error('injected R2 outage');}}),/completion marker NOT uploaded/);
  assert.ok(!errorWrites.some(x=>x.key.endsWith('/manifest.json')));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('native upload command refuses a resumed archive without user-selected project bucket',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-project-resume-'));
 try{
  const archive=createLocalArchive({projectRoot:root,accountId:'au_testaccount123',projectId:'proj_test123'});
  const receipt=await crawlSite({url:site,maxPages:1,fetchPage:stub,onPage:archive.onPage});
  const staged=archive.finalize(receipt);
  let error='';
  const code=await runNativeSiteScrape(['upload',staged.root,'--project-root',root],
    {cwd:root,stdout:{write(){}},stderr:{write:s=>error+=s}});
  assert.equal(code,2);assert.match(error,/no project R2 crawl bucket selected/);
  assert.equal(verifyLocalArchive(staged.root).run_id,receipt.run_id);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
