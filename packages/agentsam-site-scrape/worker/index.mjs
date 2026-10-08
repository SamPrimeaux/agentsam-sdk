/** Cloudflare Queues + R2 adapter for the SAME site.scrape capability.
 * Deploy as a customer/project-owned Worker, not the SDK publisher's Worker.
 * Required bindings: AUTHORIZER (project authority service), CRAWL_JOBS (Queue),
 * CRAWL_EVIDENCE (project-selected private R2). Optional: CMS_PROMOTER.
 */
import { createHash, randomBytes } from 'node:crypto';
import { crawlSite, normalizeUrl, isSameSite } from '../runtime/core.mjs';
import { createSiteIndex } from '../runtime/index.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const RUN = /^scrp_[0-9a-f]{24}$/;
const ACCOUNT = /^au_[a-zA-Z0-9_-]{4,128}$/;
const PROJECT = /^proj_[a-zA-Z0-9_-]{3,128}$/;
const MAX_PAGES = 50;
const MIME = {json:'application/json; charset=utf-8'};
const json = (data,status=200)=>new Response(JSON.stringify(data), {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const runPrefix = (account,project,runId)=>{
 if(!ACCOUNT.test(account)||!PROJECT.test(project)||!RUN.test(runId))throw Error('invalid canonical crawl identity');
 return `v1/accounts/${account}/projects/${project}/runs/${runId}`;
};
const toJSON = (data)=>JSON.stringify(data,null,2)+'\n';
const record = (key,bytes,kind,extra={})=>({key,sha256:'sha256:'+sha(bytes),bytes:bytes.length,
 content_type:kind==='image'?extra.content_type||'application/octet-stream':MIME.json,
 ...(kind==='image'||kind==='page'?{kind}:{}),...extra});
const privateMeta = (contentType=MIME.json)=>({httpMetadata:{contentType,cacheControl:'private, no-store'}});
async function loadJSON(bucket,key) {
 const object=await bucket.get(key);
 return object?JSON.parse(await object.text()):null;
}
async function storeJSON(bucket,key,obj){await bucket.put(key,toJSON(obj),privateMeta());}

function publicHttpUrl(value) {
 const url=normalizeUrl(value);
 const u=new URL(url);
 const host=u.hostname.toLowerCase();
 if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||
    host.endsWith('.test')||host.endsWith('.invalid')||host==='metadata.google.internal'||
    host.startsWith('[')|| /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
   throw Error('site.scrape requires a public DNS hostname, not a private/literal address');
 }
 return url;
}

/** Cloudflare fetch adapter: strict same-site manual redirects, bounded bodies.
 * DNS-pin validation is local-Node-only; Cloudflare's own egress policy applies
 * inside Workers, with private/literal destinations rejected here as well.
 */
export function workerFetchAdapter(seed,requestFetch=fetch,{timeoutMs=12000,minDelayMs=150}={}) {
 const origin=publicHttpUrl(seed); const requiredOrigin=new URL(origin).origin; let slot=0;
 return async function fetchPage(url,{maxBytes=1024*1024,contentTypes=['text/html']}={}) {
   let target=publicHttpUrl(url);
   for(let redirect=0;redirect<=5;redirect++) {
     if(new URL(target).origin!==requiredOrigin)throw Error('cross_origin_redirect');
     const start=Math.max(Date.now(),slot);slot=start+minDelayMs;
     if(start>Date.now())await new Promise(done=>setTimeout(done,start-Date.now()));
     const response=await requestFetch(target, {redirect:'manual',signal:AbortSignal.timeout(timeoutMs),
       headers:{'user-agent':'AgentSam-site-scrape/1 (project-owned Worker)'}});
     if([301,302,303,307,308].includes(response.status)) {
       const destination=response.headers.get('location');
       await response.body?.cancel?.();
       if(!destination)throw Error('redirect_without_location');
       target=publicHttpUrl(new URL(destination,target).href);
       continue;
     }
     if(response.status>=300&&response.status<400)throw Error('unsupported_redirect_status');
     const contentType=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
     if(response.ok&&!contentTypes.some(t=>contentType.startsWith(t))) {
       await response.body?.cancel?.();throw Error('unsupported_content_type:'+contentType);
     }
     if(Number(response.headers.get('content-length')||0)>maxBytes){await response.body?.cancel?.();throw Error('body_limit_exceeded');}
     const chunks=[];let size=0;
     const reader=response.body?.getReader?.();
     try {
       if(reader)while(true){const item=await reader.read();if(item.done)break;
         size+=item.value.byteLength;
         if(size>maxBytes)throw Error('body_limit_exceeded');
         chunks.push(Buffer.from(item.value));
       }
     }finally{if(reader)await reader.cancel().catch(()=>{});}
     return {url:target,status:response.status,contentType,body:Buffer.concat(chunks)};
   }
   throw Error('redirect_limit_exceeded');
 };
}

async function authorize(request,env,action) {
 if(typeof env.AUTHORIZER?.fetch!=='function')return {error:'project_authority_binding_missing',status:503};
 const header=request.headers.get('authorization');
 if(!header)return {error:'authorization_required',status:401};
 const result=await env.AUTHORIZER.fetch(new Request('https://project-authority.internal/site-scrape/authorize',{
   method:'POST',headers:{authorization:header,'content-type':'application/json'},
   body:JSON.stringify({action,method:request.method,origin:new URL(request.url).origin})
 }));
 if(!result.ok)return {error:'project_access_denied',status:403};
 let claims;
 try{claims=await result.json();}catch{return {error:'authority_response_invalid',status:502};}
 if(claims.ok!==true||!ACCOUNT.test(claims.account_id)||!PROJECT.test(claims.project_id)||
    !Array.isArray(claims.allowed_origins))return {error:'authority_response_invalid',status:502};
 return {claims};
}

/** Enqueue run only after the host verifies its authoritatively returned IDs. */
export async function createRun(request,env) {
 if(!env.CRAWL_JOBS?.send||!env.CRAWL_EVIDENCE?.put||!env.CRAWL_EVIDENCE?.get)return json({error:'project_queue_or_r2_binding_missing'},503);
 const auth=await authorize(request,env,'site.scrape.create');
 if(auth.error)return json({error:auth.error},auth.status);
 let data;
 try {const text=await request.text();if(text.length>16*1024)throw Error('input_too_large');data=JSON.parse(text);}catch{return json({error:'invalid_json_body'},400);}
 let url;
 try {url=publicHttpUrl(data.url);}catch{return json({error:'unsafe_site_url'},400);}
 const allowed=auth.claims.allowed_origins.some(origin=>{
   try{return new URL(origin).origin===new URL(url).origin;}catch{return false;}
 });
 if(!allowed)return json({error:'site_origin_not_authorized_for_project'},403);
 const maxPages=data.max_pages??20;
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>MAX_PAGES)return json({error:'max_pages_outside_worker_limits'},400);
 if(data.capture_assets!=null&&typeof data.capture_assets!=='boolean')return json({error:'capture_assets_must_be_boolean'},400);
 const runId='scrp_'+randomBytes(12).toString('hex');
 const prefix=runPrefix(auth.claims.account_id,auth.claims.project_id,runId);
 const job={schema_version:1,run_id:runId,account_id:auth.claims.account_id,
   project_id:auth.claims.project_id,url,max_pages:maxPages,capture_assets:!!data.capture_assets};
 const state={run_id:runId,status:'queued',queued_at:new Date().toISOString(),
   authorized_request:{url,max_pages:maxPages,capture_assets:!!data.capture_assets}};
 await storeJSON(env.CRAWL_EVIDENCE,`${prefix}/state.json`,state);
 try{await env.CRAWL_JOBS.send(job);}catch{
   await storeJSON(env.CRAWL_EVIDENCE,`${prefix}/state.json`,{...state,status:'enqueue_failed'});
   return json({error:'failed_to_enqueue_crawl',run_id:runId},503);
 }
 return json({run_id:runId,status:'queued',capability:'site.scrape'},202);
}

export async function processRun(job,env,{fetchExternal=fetch}={}) {
 if(!job||job.schema_version!==1||!RUN.test(job.run_id)||!ACCOUNT.test(job.account_id)||!PROJECT.test(job.project_id)){
   throw Error('untrusted queue job envelope');
 }
 if(typeof env.CRAWL_EVIDENCE?.get!=='function'||typeof env.CRAWL_EVIDENCE?.put!=='function')throw Error('project R2 binding missing');
 const prefix=runPrefix(job.account_id,job.project_id,job.run_id);
 if(await env.CRAWL_EVIDENCE.head?.(`${prefix}/manifest.json`))return {already_committed:true,run_id:job.run_id};
 const authorized=await loadJSON(env.CRAWL_EVIDENCE,`${prefix}/state.json`);
 if(!authorized||!['queued','running','retrying'].includes(authorized.status)||
    authorized.run_id!==job.run_id||authorized.authorized_request?.url!==job.url||
    authorized.authorized_request?.max_pages!==job.max_pages||
    authorized.authorized_request?.capture_assets!==job.capture_assets){
   throw Error('queue job does not match an authorized project crawl request');
 }
 if(!Number.isInteger(job.max_pages)||job.max_pages<1||job.max_pages>MAX_PAGES||typeof job.capture_assets!=='boolean')throw Error('invalid run bounds');
 const seed=publicHttpUrl(job.url);
 await storeJSON(env.CRAWL_EVIDENCE,`${prefix}/state.json`,{...authorized,status:'running',started_at:new Date().toISOString()});
 const entries=[];let nextPage=0;
 const pages=[];
 const put=async(key,body,kind,extra={})=>{
   const contents=Buffer.isBuffer(body)?body:Buffer.from(body);
   const metadata=record(key,contents,kind,extra);
   await env.CRAWL_EVIDENCE.put(`${prefix}/${key}`,contents,privateMeta(metadata.content_type));
   entries.push(metadata);
 };
 try {
   const receipt=await crawlSite({url:seed,runId:job.run_id,runtime:'cloudflare-worker',
     maxPages:job.max_pages,concurrency:3,maxAssets:Math.min(100,job.max_pages*10),
     captureAssets:job.capture_assets,fetchPage:workerFetchAdapter(seed,fetchExternal),
     onPage:async page=>{
       const key=`pages/${String(++nextPage).padStart(5,'0')}.json`;
       await put(key,toJSON(page),'page',{source_url:page.url});pages.push(page);
     },
     onAsset:async asset=>{
       const key=`assets/${asset.sha256.slice(7)}`;
       if(!entries.some(e=>e.key===key))await put(key,asset.body,'image',
         {source_url:asset.url,content_type:asset.contentType||'application/octet-stream'});
     }});
   await put('index.json',toJSON(createSiteIndex(pages)),'index');
   await put('receipt.json',toJSON(receipt),'receipt');
   const manifest={schema_version:1,kind:'agentsam.crawl-evidence.v1',visibility:'private',
     account_id:job.account_id,project_id:job.project_id,run_id:job.run_id,prefix,
     receipt_status:receipt.status,crawl_content_hash:receipt.content_hash,objects:entries};
   // Commit only AFTER all objects succeed; at-least-once retries remain safe.
   await env.CRAWL_EVIDENCE.put(`${prefix}/manifest.json`,toJSON(manifest),privateMeta());
   await storeJSON(env.CRAWL_EVIDENCE,`${prefix}/state.json`,{
     ...authorized,status:receipt.status,completed_at:receipt.completed_at,counts:receipt.counts});
   return receipt;
 }catch(error) {
   await storeJSON(env.CRAWL_EVIDENCE,`${prefix}/state.json`,{...authorized,status:'retrying',error:'crawl_failed'});
   throw error;
 }
}

export async function readRun(request,env,runId,{index=false}={}) {
 if(!env.CRAWL_EVIDENCE?.get)return json({error:'project_r2_binding_missing'},503);
 const auth=await authorize(request,env,index?'site.scrape.read.index':'site.scrape.read');
 if(auth.error)return json({error:auth.error},auth.status);
 const prefix=runPrefix(auth.claims.account_id,auth.claims.project_id,runId);
 if(index){
   if(!(await env.CRAWL_EVIDENCE.head(`${prefix}/manifest.json`)))return json({error:'crawl_not_completed'},409);
   const manifest=await loadJSON(env.CRAWL_EVIDENCE,`${prefix}/manifest.json`);
   const expected=manifest?.objects?.find(item=>item.key==='index.json');
   const indexBody=await env.CRAWL_EVIDENCE.get(`${prefix}/index.json`);
   if(!expected || !indexBody)return json({error:'verified_index_not_found'},404);
   const content=Buffer.from(await indexBody.arrayBuffer());
   if('sha256:'+sha(content)!==expected.sha256)return json({error:'evidence_checksum_mismatch'},409);
   return json(JSON.parse(content.toString('utf8')));
 }
 const state=await loadJSON(env.CRAWL_EVIDENCE,`${prefix}/state.json`);
 return state?json(state):json({error:'run_not_found'},404);
}

export async function promoteRun(request,env,runId) {
 if(typeof env.CMS_PROMOTER?.fetch!=='function')return json({error:'cms_promotion_adapter_unavailable'},503);
 const auth=await authorize(request,env,'site.scrape.promote');
 if(auth.error)return json({error:auth.error},auth.status);
 const prefix=runPrefix(auth.claims.account_id,auth.claims.project_id,runId);
 const manifest=await loadJSON(env.CRAWL_EVIDENCE,`${prefix}/manifest.json`);
 if(!manifest)return json({error:'crawl_not_committed'},409);
 let body;
 try{body=await request.json();}catch{return json({error:'invalid_json'},400);}
 const choices=body?.asset_keys;
 if(!Array.isArray(choices)||!choices.length||choices.length>100||choices.some(x=>typeof x!=='string')){
   return json({error:'asset_keys_required'},400);
 }
 const valid=new Set(manifest.objects.filter(x=>x.kind==='image').map(x=>x.key));
 if(choices.some(x=>!valid.has(x)))return json({error:'asset_not_in_verified_crawl_manifest'},403);
 // CMS authority owns rights review, derivative generation, attachment and publish.
 // Never write directly into WEBSITE_ASSETS here.
 const result=await env.CMS_PROMOTER.fetch(new Request('https://cms-authority.internal/site-scrape/promote',{
   method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
     account_id:auth.claims.account_id,project_id:auth.claims.project_id,run_id:runId,
     evidence_binding:'CRAWL_EVIDENCE',prefix,asset_keys:choices,review_required:true,
   })}));
 if(!result.ok)return json({error:'cms_promotion_rejected'},result.status>=500?502:403);
 const receipt=await result.json();
 if(receipt?.ok!==true||receipt?.project_id!==auth.claims.project_id||!receipt?.receipt_id){
   return json({error:'cms_promotion_receipt_invalid'},502);
 }
 return json({status:'submitted_to_cms_review',receipt},202);
}

/** Factory is testable with fake Queue/R2/authority adapters, no hosted writes. */
export function createSiteScrapeWorker({fetchExternal=fetch}={}) {
 return {
   async fetch(request,env){
     const u=new URL(request.url),path=u.pathname;
     if(path==='/health'&&request.method==='GET')return json({ok:true,capability:'site.scrape',runtime:'cloudflare-queue'});
     try{
       if(path==='/v1/crawls'&&request.method==='POST')return await createRun(request,env);
       const match=path.match(/^\/v1\/crawls\/(scrp_[a-f0-9]{24})(?:\/(index|promote))?$/);
       if(match){
         if(request.method==='GET'&&match[2]!=='promote')return await readRun(request,env,match[1],{index:match[2]==='index'});
         if(request.method==='POST'&&match[2]==='promote')return await promoteRun(request,env,match[1]);
       }
       return json({error:'not_found'},404);
     }catch{return json({error:'crawl_internal_error'},500);}
   },
   async queue(batch,env){
     for(const message of batch.messages){
       try{await processRun(message.body,env,{fetchExternal});message.ack();}
       catch(error){console.error('site.scrape queued run failed',String(error.message).slice(0,140));message.retry();}
     }
   }
 };
}
export default createSiteScrapeWorker();
