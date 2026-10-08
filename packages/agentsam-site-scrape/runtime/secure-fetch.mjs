/** Node fetch adapter with pinned, public-only DNS and per-hop redirect validation.
 * A serverless Worker uses its own network policy and an alternate adapter.
 */
import dns from 'node:dns';
import net from 'node:net';
import { Agent, fetch } from 'undici';
import { normalizeUrl, isSameSite } from './core.mjs';

export function isPublicAddress(value) {
  const family=net.isIP(value);
  if(family===4){
    const [a,b,c,d]=value.split('.').map(Number);
    if(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||
      a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&b>=18&&b<=19||
      a===192&&b===0&&c===0||a===255||a===192&&b===0&&c===2||a===198&&b===51&&c===100||
      a===203&&b===0&&c===113) return false;
    return Number.isInteger(d);
  }
  if(family===6){
    const lower=value.toLowerCase();
    if(lower.startsWith('::ffff:')) return false;
    if(lower.startsWith('2001:db8:')) return false;
    const first=parseInt(lower.split(':')[0],16);
    return first>=0x2000 && first<=0x3fff;
  }
  return false;
}
export function assertPublicUrl(input) {
  const url=new URL(normalizeUrl(input));
  const host=url.hostname.toLowerCase();
  if(host==='localhost'||host==='metadata.google.internal'||host.endsWith('.localhost')||host.endsWith('.local')||
     host.endsWith('.internal')||host.endsWith('.test')||host.endsWith('.invalid')||host.endsWith('.example')) {
    throw new Error('blocked hostname');
  }
  if(net.isIP(host) && !isPublicAddress(host)) throw Error('blocked non-public IP');
  return url.href;
}

export function createSecureFetch({seedUrl,timeoutMs=12000,maxRedirects=5,minDelayMs=150,fetchImpl=fetch,dnsLookup=dns.lookup}={}) {
  const seed=assertPublicUrl(seedUrl);
  // IMPORTANT: DNS is checked again when the socket actually connects, rather
  // than validating and then relying on a second unrestricted DNS resolution.
  const dispatcher=new Agent({connect:{lookup(hostname,opts,callback){
    dnsLookup(hostname,{all:true,verbatim:true},(err,addresses)=>{
      if(err)return callback(err);
      if(!Array.isArray(addresses)||!addresses.length||addresses.some(item=>!isPublicAddress(item.address))) {
        return callback(new Error('DNS target is not public'));
      }
      const chosen=addresses[0];
      if(opts.all) callback(null,addresses);else callback(null,chosen.address,chosen.family);
    });
  }},pipelining:0});
  const allowed=(value)=>{const u=assertPublicUrl(value);if(!isSameSite(seed,u))throw Error('redirect_left_site');return u;};
  let nextSlot=0;
  async function fetchPage(url,{maxBytes=1024*1024,contentTypes=['text/html']}={}) {
    let current=allowed(url);
    for(let step=0;step<=maxRedirects;step++){
      const startAt=Math.max(Date.now(),nextSlot);
      nextSlot=startAt+minDelayMs;
      if(startAt>Date.now())await new Promise(resolve=>setTimeout(resolve,startAt-Date.now()));
      const response=await fetchImpl(current,{redirect:'manual',dispatcher,
        headers:{'user-agent':'AgentSam-site-scrape/1 (+public-site-audit)',accept:'text/html,image/*,text/plain;q=0.8,*/*;q=0.2'},
        signal:AbortSignal.timeout(timeoutMs)});
      if([301,302,303,307,308].includes(response.status)){
        const loc=response.headers.get('location');
        await response.body?.cancel?.();
        if(!loc)throw Error('redirect_missing_location');
        current=allowed(new URL(loc,current).href);continue;
      }
      const contentType=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
      if(response.status>=200&&response.status<300 && !contentTypes.some(v=>contentType.startsWith(v))) {
        await response.body?.cancel?.();throw Error('content_type_not_allowed:'+contentType);
      }
      if(response.status>=300 && response.status<400) {await response.body?.cancel?.();throw Error('unsupported_redirect_status_'+response.status);}
      if(Number(response.headers.get('content-length')||0)>maxBytes) {
        await response.body?.cancel?.();throw Error('response_over_size_limit');
      }
      const reader=response.body?.getReader?.();const chunks=[];let size=0;
      try{
        if(reader) while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
          if(size>maxBytes)throw Error('response_over_size_limit');chunks.push(Buffer.from(value));}
      }finally{if(reader)try{await reader.cancel();}catch{}}
      return {url:current,status:response.status,contentType,body:Buffer.concat(chunks)};
    }
    throw Error('too_many_redirects');
  }
  return {fetchPage,close:()=>dispatcher.close()};
}
