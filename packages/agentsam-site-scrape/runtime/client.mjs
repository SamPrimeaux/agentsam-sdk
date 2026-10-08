/** Project-owned host client for the site.scrape Worker service binding.
 * No platform URLs, tokens, buckets, or account IDs in this SDK module.
 * The calling host supplies an authorized session header and its own transport.
 */
const PATH = '/v1/crawls';
const RUN = /^scrp_[0-9a-f]{24}$/;
export function createSiteScrapeClient({baseUrl,fetchImpl=fetch,authorize}={}) {
 if(typeof baseUrl!=='string'||!/^https?:\/\//.test(baseUrl))throw Error('site.scrape project endpoint URL is required');
 if(typeof fetchImpl!=='function')throw TypeError('site.scrape fetch transport required');
 if(typeof authorize!=='function')throw TypeError('site.scrape host must provide request authorization');
 const base = new URL(baseUrl);
 async function request(method,relative,body) {
   const token=await authorize();
   if(typeof token!=='string'||!token.startsWith('Bearer ')||token.length<=7)throw Error('missing authorized project session');
   const target=new URL(relative,base);
   if(target.origin!==base.origin)throw Error('service origin mismatch');
   const response=await fetchImpl(new Request(target,{method,headers:{authorization:token,'content-type':'application/json'},
     ...(body?{body:JSON.stringify(body)}:{})}));
   const content=await response.json().catch(()=>({error:'invalid_service_response'}));
   if(!response.ok){const error=new Error(content.error||`site.scrape HTTP ${response.status}`);error.status=response.status;throw error;}
   return content;
 }
 const identifier=id=>{if(!RUN.test(id||''))throw Error('invalid site.scrape run ID');return id;};
 return Object.freeze({
  submit({url,maxPages=20,captureAssets=false}){
    return request('POST',PATH,{url,max_pages:maxPages,capture_assets:captureAssets});
  },
  status(runId){return request('GET',`${PATH}/${identifier(runId)}`);},
  index(runId){return request('GET',`${PATH}/${identifier(runId)}/index`);},
  submitForReview(runId,assetKeys){return request('POST',`${PATH}/${identifier(runId)}/promote`,{asset_keys:assetKeys});},
 });
}
