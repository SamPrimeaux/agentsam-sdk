import test from 'node:test';
import assert from 'node:assert/strict';
import {createSiteScrapeWorker,workerFetchAdapter} from '../index.mjs';

class MemoryR2 {
 constructor(){this.data=new Map();this.puts=[];this.failOn=null;}
 async put(key,content){
  if(this.failOn&&key.includes(this.failOn))throw Error('R2 simulated transient failure');
  const bytes=Buffer.isBuffer(content)?content:Buffer.from(content);
  this.data.set(key,bytes);this.puts.push(key);
  return {key};
 }
 async get(key){const bytes=this.data.get(key);return bytes?{text:async()=>bytes.toString(),arrayBuffer:async()=>Uint8Array.from(bytes).buffer,body:bytes}:null;}
 async head(key){return this.data.has(key)?{key}:null;}
}
const html='<html><head><title>Welcome</title></head><body><h1>Hi</h1><img src="/hero.png"/><a href="/about">About</a></body></html>';
const publicFetch=async url=>{
 const u=new URL(url);
 if(u.pathname==='/robots.txt')return new Response('User-agent: *\nDisallow: /private',{headers:{'content-type':'text/plain'}});
 if(u.pathname==='/hero.png')return new Response(new Uint8Array([137,80,78,71]),{headers:{'content-type':'image/png'}});
 if(u.pathname==='/about')return new Response('<title>About</title><p>Test</p>',{headers:{'content-type':'text/html'}});
 if(u.pathname==='/')return new Response(html,{headers:{'content-type':'text/html'}});
 return new Response('missing',{status:404,headers:{'content-type':'text/html'}});
};
function harness({authorized=true,allowOrigin='https://example.com',cms=false}={}){
 const bucket=new MemoryR2(),jobs=[],seenPromotion=[];
 const env={CRAWL_EVIDENCE:bucket,CRAWL_JOBS:{send:async body=>{jobs.push(body);}},
  AUTHORIZER:{fetch:async req=>{
   assert.match(req.url,/\/site-scrape\/authorize$/);
   if(!authorized||req.headers.get('authorization')!=='Bearer test-authority')return Response.json({ok:false},{status:403});
   return Response.json({ok:true,account_id:'au_customer1234',project_id:'proj_website123',allowed_origins:[allowOrigin]});
  }},
  ...(cms?{CMS_PROMOTER:{fetch:async request=>{
   const args=await request.json();seenPromotion.push(args);
   return Response.json({ok:true,project_id:args.project_id,receipt_id:'cms_review_001'});
  }}}:{})
 };
 const worker=createSiteScrapeWorker({fetchExternal:publicFetch});
 const api=(route,method='GET',body,authorizedHeader=true)=>worker.fetch(new Request('https://project-worker.example'+route,{
  method,headers:{...(authorizedHeader?{authorization:'Bearer test-authority'}:{}),...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})}),env);
 return {bucket,env,jobs,api,worker,seenPromotion};
}

test('unconfigured or denied authority fails closed before queue',async()=>{
 const x=harness({authorized:false});
 assert.equal((await x.api('/v1/crawls','POST',{url:'https://example.com/'})).status,403);
 assert.equal(x.jobs.length,0);
 delete x.env.AUTHORIZER;
 assert.equal((await x.api('/v1/crawls','POST',{url:'https://example.com/'})).status,503);
 assert.equal(x.jobs.length,0);
});

test('request site is authorizer-scoped, no arbitrary project/publisher bucket',async()=>{
 const x=harness({allowOrigin:'https://other-example.com'});
 assert.equal((await x.api('/v1/crawls','POST',{url:'https://example.com/',project_id:'proj_evil'})).status,403);
 assert.equal((await x.api('/v1/crawls','POST',{url:'http://127.0.0.1/private'})).status,400);
 assert.equal(x.jobs.length,0);
});

test('end-to-end project-authorized request → queue → R2 → index + status + CMS review',async()=>{
 const x=harness({cms:true});
 const submission=await x.api('/v1/crawls','POST',{url:'https://example.com/',max_pages:2,capture_assets:true,project_id:'proj_evil'});
 assert.equal(submission.status,202);
 const {run_id}=await submission.json();
 assert.match(run_id,/^scrp_[0-9a-f]{24}$/);
 assert.equal(x.jobs.length,1);
 assert.equal(x.jobs[0].project_id,'proj_website123');
 const statusPath='/v1/crawls/'+run_id;
 assert.equal((await (await x.api(statusPath)).json()).status,'queued');
 const ack=[];
 await x.worker.queue({messages:[{body:x.jobs[0],ack:()=>ack.push('ack'),retry:()=>ack.push('retry')}]},x.env);
 assert.deepEqual(ack,['ack']);
 const status=await (await x.api(statusPath)).json();
 assert.equal(status.status,'completed');
 assert.equal(status.counts.pages_fetched,2);
 assert.equal(status.counts.images_fetched,1);
 const indexResponse=await x.api(statusPath+'/index');
 assert.equal(indexResponse.status,200);
 const index=await indexResponse.json();
 assert.equal(index.schema,'agentsam.site.index.v1');
 assert.equal(index.counts.pages,2);
 assert.equal(index.counts.assets,1);
 assert.ok(index.counts.edges>=1);
 const prefix=`v1/accounts/au_customer1234/projects/proj_website123/runs/${run_id}`;
 const manifest=JSON.parse((await x.bucket.get(prefix+'/manifest.json')).body.toString());
 assert.ok(manifest.objects.some(e=>e.kind==='page'));
 assert.ok(manifest.objects.some(e=>e.kind==='image'));
 assert.equal(x.bucket.puts.findLastIndex(k=>k===prefix+'/manifest.json'), x.bucket.puts.length-2);
 const key=manifest.objects.find(e=>e.kind==='image').key;
 assert.equal((await x.api(statusPath+'/promote','POST',{asset_keys:['assets/not-in-run']})).status,403);
 const promotion=await x.api(statusPath+'/promote','POST',{asset_keys:[key]});
 assert.equal(promotion.status,202);
 assert.equal((await promotion.json()).receipt.receipt_id,'cms_review_001');
 assert.equal(x.seenPromotion[0].review_required,true);
 assert.deepEqual(x.seenPromotion[0].asset_keys,[key]);
 assert.equal(x.seenPromotion[0].project_id,'proj_website123');
 const second=[];
 await x.worker.queue({messages:[{body:x.jobs[0],ack:()=>second.push('ack'),retry:()=>second.push('retry')}]},x.env);
 assert.deepEqual(second,['ack']);
});

test('missing CMS adapter rejects promotion, no fake publication success',async()=>{
 const x=harness();
 const r=await x.api('/v1/crawls/scrp_'+'a'.repeat(24)+'/promote','POST',{asset_keys:['assets/anything']});
 assert.equal(r.status,503);
});

test('R2 object failure causes queue retry; no completion marker',async()=>{
 const x=harness();
 const response=await x.api('/v1/crawls','POST',{url:'https://example.com/',max_pages:1});
 const {run_id}=await response.json();
 x.bucket.failOn='/index.json';
 const events=[];
 await x.worker.queue({messages:[{body:x.jobs[0],ack:()=>events.push('ack'),retry:()=>events.push('retry')}]},x.env);
 assert.deepEqual(events,['retry']);
 const prefix=`v1/accounts/au_customer1234/projects/proj_website123/runs/${run_id}`;
 assert.equal(await x.bucket.head(prefix+'/manifest.json'),null);
 assert.equal((await (await x.api('/v1/crawls/'+run_id)).json()).status,'retrying');
 x.bucket.failOn=null;
 const retry=[];
 await x.worker.queue({messages:[{body:x.jobs[0],ack:()=>retry.push('ack'),retry:()=>retry.push('retry')}]},x.env);
 assert.deepEqual(retry,['ack']);
 assert.ok(await x.bucket.head(prefix+'/manifest.json'));
});

test('Worker fetch adapter enforces same-origin and body size before crawl',async()=>{
 const redirect=workerFetchAdapter('https://example.com/',async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}}),{minDelayMs:0});
 await assert.rejects(redirect('https://example.com/'),/public DNS hostname/);
 const over=workerFetchAdapter('https://example.com/',async()=>new Response('more than 3 characters',{headers:{'content-type':'text/html'}}),{minDelayMs:0});
 await assert.rejects(over('https://example.com/',{maxBytes:3}),/body_limit_exceeded/);
});

test('project config generator resolves chosen user bucket; no shared defaults or overwrites',async()=>{
 const {projectWorkerPlan,writeProjectWorker}=await import('../project-config.mjs');
 const fs=await import('node:fs');
 const os=await import('node:os');
 const path=await import('node:path');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-site-customer-'));
 try {
  assert.throws(()=>projectWorkerPlan(root,{queueName:'my-crawls',authorityService:'project-iam'}),/project must select/);
  const a=projectWorkerPlan(root,{bucket:'user1234-private-scrapes',queueName:'user1234-queue',authorityService:'user1234-auth',cmsService:'user1234-cms'});
  assert.equal(a.bucket,'user1234-private-scrapes');
  assert.equal(a.wrangler.r2_buckets[0].bucket_name,'user1234-private-scrapes');
  assert.equal(a.wrangler.queues.consumers[0].max_batch_size,1);
  assert.equal(a.wrangler.workers_dev,false);
  assert.equal(a.wrangler.services[0].service,'user1234-auth');
  const saved=writeProjectWorker(root,{bucket:'user1234-private-scrapes',queueName:'user1234-queue',authorityService:'user1234-auth'});
  assert.ok(fs.existsSync(saved.worker_path));
  assert.match(fs.readFileSync(saved.worker_path,'utf8'),/@inneranimalmedia\/agentsam-sdk\/site-scrape\/worker/);
  assert.throws(()=>writeProjectWorker(root,{bucket:'user1234-private-scrapes',queueName:'user1234-queue',authorityService:'user1234-auth'}),/refusing overwrite/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('project-owned SDK client submits and reads without platform credentials or fixed endpoint',async()=>{
 const {createSiteScrapeClient}=await import('../../runtime/client.mjs');
 const x=harness({cms:true});
 const client=createSiteScrapeClient({baseUrl:'https://project-worker.example/',
  authorize:()=> 'Bearer test-authority',
  fetchImpl:request=>x.worker.fetch(request,x.env)});
 const result=await client.submit({url:'https://example.com/',maxPages:1});
 assert.equal(result.status,'queued');
 const queued=await client.status(result.run_id);
 assert.equal(queued.status,'queued');
 await x.worker.queue({messages:[{body:x.jobs[0],ack:()=>{},retry:()=>{throw Error('unexpected retry');}}]},x.env);
 const current=await client.status(result.run_id);
 assert.equal(current.status,'completed');
 assert.equal((await client.index(result.run_id)).schema,'agentsam.site.index.v1');
 assert.equal(x.jobs[0].account_id,'au_customer1234');
});

test('client rejects absent host authorization rather than inheriting SDK identity',async()=>{
 const {createSiteScrapeClient}=await import('../../runtime/client.mjs');
 const client=createSiteScrapeClient({baseUrl:'https://project-worker.example',authorize:()=>null,
  fetchImpl:()=>{throw Error('should not access transport');}});
 await assert.rejects(client.submit({url:'https://example.com/'}),/missing authorized project session/);
});

test('Queue worker rejects a forged or altered job not backed by a project-authorized request',async()=>{
 const x=harness();const forged={schema_version:1,run_id:'scrp_'+'f'.repeat(24),account_id:'au_customer1234',
   project_id:'proj_website123',url:'https://example.com/',max_pages:1,capture_assets:false};
 const events=[];
 await x.worker.queue({messages:[{body:forged,ack:()=>events.push('ack'),retry:()=>events.push('retry')}]},x.env);
 assert.deepEqual(events,['retry']);
 const result=await x.api('/v1/crawls','POST',{url:'https://example.com/',max_pages:1});
 assert.equal(result.status,202);
 const job={...x.jobs[0],url:'https://example.com/unapproved-path'};
 const changed=[];
 await x.worker.queue({messages:[{body:job,ack:()=>changed.push('ack'),retry:()=>changed.push('retry')}]},x.env);
 assert.deepEqual(changed,['retry']);
});
