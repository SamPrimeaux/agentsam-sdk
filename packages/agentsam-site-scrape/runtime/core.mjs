/** site.scrape: Node-native bounded traversal of the canonical capability, not a second product/scanner.
 * The runtime adapter supplies a security-constrained fetch function and sink.
 * Rust Machine/Repository own downstream deterministic file evidence/indexing.
 */
import { createHash } from 'node:crypto';
import { parse } from 'parse5';
import {XMLParser} from 'fast-xml-parser';

export const SITE_SCRAPE_CAPABILITY = 'site.scrape';
export const SITE_SCRAPE_SCHEMA = 1;
export const UNAVAILABLE_INPUTS = Object.freeze(['scope.maxDepth', 'policy.timeoutMs', 'capture.html', 'capture.text', 'scope.allowedOrigins']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const cleaned = text => String(text || '').replace(/\s+/g,' ').trim();

export function normalizeUrl(value, base) {
  if(String(value||'').length>4096) throw Error('url_too_long');
  const u = new URL(String(value || ''), base);
  if (!['https:', 'http:'].includes(u.protocol) || !u.hostname || u.username || u.password) throw Error('unsupported_url');
  u.hash = '';
  for(const k of [...u.searchParams.keys()]) if(/^(utm_.*|fbclid|gclid|msclkid)$/i.test(k)) u.searchParams.delete(k);
  return u.href;
}
export function isSameSite(one, two) {
  return new URL(one).hostname.replace(/^www\./,'').toLowerCase() === new URL(two).hostname.replace(/^www\./,'').toLowerCase();
}
function attrs(node) { return Object.fromEntries((node.attrs || []).map(a=>[a.name, a.value])); }
function textOf(node) { return node.nodeName === '#text' ? node.value : (node.childNodes||[]).map(textOf).join(''); }
export function extractHtml(html, sourceUrl) {
  const document = parse(String(html));
  const result = {title:'',meta:{}, links:[], images:[],content:[]};
  const links = new Set(), images = new Set();
  function visit(node) {
    const tag = node.tagName || '', a = attrs(node);
    if(tag === 'title') result.title = cleaned(textOf(node)).slice(0,500);
    if(tag === 'meta' && (a.name || a.property) && a.content) result.meta[a.name || a.property] = a.content.slice(0,2000);
    if(tag === 'a' && a.href) {
      try { const url=normalizeUrl(a.href,sourceUrl); if(!links.has(url)){links.add(url);result.links.push({url,text:cleaned(textOf(node)).slice(0,220)});} }catch{}
    }
    if(['img','source'].includes(tag)) {
      const sources=[a.src,a['data-src'],a['data-original'],...(a.srcset || '').split(',').map(s=>s.trim().split(/\s+/)[0])];
      for(const source of sources) if(source) {
        try {const url=normalizeUrl(source,sourceUrl);if(!images.has(url)){images.add(url);result.images.push({url,alt:cleaned(a.alt||''),title:cleaned(a.title||'')});}}catch{}
      }
    }
    if(['h1','h2','h3','p'].includes(tag)) {
      const text=cleaned(textOf(node)); if(text) result.content.push({kind:tag,text:text.slice(0,12000)});
    }
    if(!['script','style','noscript','template'].includes(tag)) for(const child of node.childNodes || []) visit(child);
  }
  visit(document);
  return result;
}

function robotsRule(text, agent = 'AgentSam') {
  // Scoped groups: wildcard or our agent, default-deny only where Disallow matches.
  const groups=[];let current=null;
  for(const line of text.split(/\r?\n/)) {
    const stripped=line.replace(/#.*$/,'').trim(); const i=stripped.indexOf(':');if(i<0) continue;
    const key=stripped.slice(0,i).trim().toLowerCase(), val=stripped.slice(i+1).trim();
    if(key==='user-agent') {if(!current||current.rules.length){current={agents:[],rules:[]};groups.push(current);} current.agents.push(val.toLowerCase());}
    else if(['allow','disallow'].includes(key) && current) current.rules.push({allow:key==='allow',pattern:val});
  }
  const agentName=agent.toLowerCase();
  const selected=groups.filter(g=>g.agents.some(a=>a!=='*'&&(agentName.includes(a)||a.includes(agentName))));
  return (selected.length ? selected: groups.filter(g=>g.agents.includes('*'))).flatMap(g=>g.rules);
}
export function robotsAllowed(robotsBody,url,agent='AgentSam') {
  const path = new URL(url).pathname + new URL(url).search;
  let best=-1,allow=true;
  for(const rule of robotsRule(robotsBody,agent)) {
    if(!rule.pattern) continue;
    const ending=rule.pattern.endsWith('$');
    const raw=ending?rule.pattern.slice(0,-1):rule.pattern;
    const escape=(value)=>[...value].map(ch=>'\\.[]{}()+?^$|'.includes(ch)?'\\'+ch:ch).join('');
    const expression='^'+raw.split('*').map(escape).join('.*')+(ending?'$':'');
    // Parse wildcard and end anchors conservatively; longest matching rule wins.
    if(new RegExp(expression).test(path)) {
      const length=raw.replaceAll('*','').length;
      if(length>best || length===best && rule.allow){allow=rule.allow;best=length;}
    }
  }
  return allow;
}

/** Invoke with fetchPage(url,{maxBytes,contentTypes}) that validates every DNS
 * target and manual redirect, and never calls an untrusted host on its own. */
export async function crawlSite({url,maxPages=20,concurrency=3,maxBytes=1024*1024,maxAssets=1000,captureAssets=false,
  respectRobots=true,runId,runtime='node-local',fetchPage,onPage=async()=>{},onAsset=async()=>{},onProgress=()=>{},clock=()=>Date.now()}) {
  if(typeof fetchPage!=='function') throw TypeError('a secure fetchPage adapter is required');
  if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>5000) throw RangeError('maxPages must be 1..5000');
  if(!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>16) throw RangeError('concurrency must be 1..16');
  if(!Number.isSafeInteger(maxAssets)||maxAssets<0||maxAssets>10000) throw RangeError('maxAssets must be 0..10000');
  const seed=normalizeUrl(url), started=clock(), candidates=[seed],seen=new Set(), queued=new Set([seed]);
  const pages=[],errors=[],assets=[],robotsCache=new Map();let cursor=0;
  async function allowed(pageUrl) {
    if(!respectRobots) return true;
    const origin=new URL(pageUrl).origin;
    if(!robotsCache.has(origin)) {
      robotsCache.set(origin,(async()=>{
        try {
          const response=await fetchPage(origin+'/robots.txt',{maxBytes:256*1024,contentTypes:['text/plain','text/html']});
          if(response.status===404) return '';
          if(response.status>=500) throw Error('robots_service_unavailable');
          if(response.status>=400) return '';
          return response.body.toString('utf8');
        } catch(e) {throw Error('robots_unavailable:'+e.message);}
      })());
    }
    return robotsAllowed(await robotsCache.get(origin),pageUrl);
  }
  // Respect a site's published sitemap. JS-hydrated storefronts commonly
  // expose SEO metadata in HTML but their navigation links only after JS runs.
  // Bounded XML sitemap discovery provides real URLs without browser rendering,
  // a second site scanner, or any cross-site access.
  async function discoverSitemaps() {
    const origin=new URL(seed).origin;
    const roots=[origin+'/sitemap.xml'];
    if(respectRobots) {
      try {
        await allowed(seed);
        const robots=await robotsCache.get(origin);
        for(const line of robots.split(/\r?\n/)) {
          const value=line.replace(/#.*$/,'').match(/^\s*sitemap\s*:\s*(\S+)/i)?.[1];
          if(value)roots.push(value);
        }
      }catch{return; /* crawler will independently report robots failure */}
    }
    const seenMaps=new Set();
    const parser=new XMLParser({ignoreAttributes:true,trimValues:true});
    while(roots.length && seenMaps.size<8 && candidates.length<maxPages*20) {
      let sitemap;
      try {
        sitemap=normalizeUrl(roots.shift());
        if(!isSameSite(seed,sitemap)||new URL(sitemap).origin!==origin||seenMaps.has(sitemap))continue;
        seenMaps.add(sitemap);
        if(respectRobots && !(await allowed(sitemap)))continue;
        const response=await fetchPage(sitemap,{maxBytes:1024*1024,
          contentTypes:['application/xml','text/xml','text/plain','application/rss+xml']});
        if(response.status>=400)continue;
        const parsed=parser.parse(response.body.toString('utf8'));
        const urls=parsed?.urlset?.url, maps=parsed?.sitemapindex?.sitemap;
        const entries=urls==null?[]:Array.isArray(urls)?urls:[urls];
        for(const entry of entries) {
          if(candidates.length>=maxPages*20)break;
          try {
            const discovered=normalizeUrl(entry?.loc);
            if(!isSameSite(seed,discovered)||queued.has(discovered))continue;
            queued.add(discovered);candidates.push(discovered);
          }catch{/* invalid sitemap URL is not a crawl target */}
        }
        for(const entry of maps==null?[]:Array.isArray(maps)?maps:[maps]) {
          if(roots.length+seenMaps.size>=8)break;
          if(typeof entry?.loc==='string')roots.push(entry.loc);
        }
      }catch{/* a missing/malformed sitemap is not a fatal crawl error */}
    }
  }
  await discoverSitemaps();
  async function visit(next) {
    try {
      if(!isSameSite(seed,next)) return;
      if(!(await allowed(next))){errors.push({url:next,kind:'blocked',error:'blocked_by_robots'});return;}
      const response=await fetchPage(next,{maxBytes,contentTypes:['text/html','application/xhtml+xml']});
      if(!isSameSite(seed,response.url||next)) throw Error('redirect_left_site');
      if(response.status>=400) throw Error('http_'+response.status);
      const html=response.body.toString('utf8'), parsed=extractHtml(html,response.url||next);
      const page={url:response.url||next,title:parsed.title,meta:parsed.meta,content:parsed.content,
                  links:parsed.links,images:parsed.images,sha256:'sha256:'+sha(response.body)};
      await onPage(page);pages.push({url:page.url,title:page.title,image_count:parsed.images.length});
      if(captureAssets) for(const img of parsed.images) if(isSameSite(seed,img.url)&&assets.length<maxAssets) assets.push(img);
      for(const link of parsed.links) if(candidates.length < maxPages*20 && isSameSite(seed,link.url)&&!queued.has(link.url)&&!seen.has(link.url)) {
        queued.add(link.url);candidates.push(link.url);
      }
      onProgress({type:'page',url:page.url});
    }catch(e){errors.push({url:next,kind:/blocked|private|robots/i.test(e.message)?'blocked':'failed',error:e.message});onProgress({type:'error',url:next,error:e.message});}
  }
  // Bounded work queue with deterministic start order; no unlimited Promise fan-out.
  async function worker(){
    while(cursor<candidates.length && seen.size<maxPages) {
      const next=candidates[cursor++];if(!next||seen.has(next)) continue;
      // Cross-worker race is avoided because JS yields only within visit().
      seen.add(next);await visit(next);
    }
  }
  await Promise.all(Array.from({length:concurrency},()=>worker()));
  let assetFetched=0;
  if(captureAssets) {
    const unique=[...new Map(assets.map(a=>[a.url,a])).values()];
    let ai=0;await Promise.all(Array.from({length:concurrency},async()=>{
      while(ai<unique.length) {
        const img=unique[ai++];try{
          if(!(await allowed(img.url))){errors.push({url:img.url,kind:'blocked',error:'asset:blocked_by_robots'});continue;}
          const r=await fetchPage(img.url,{maxBytes:10*1024*1024,contentTypes:['image/']});
          await onAsset({url:img.url,body:r.body,contentType:r.contentType,sha256:'sha256:'+sha(r.body)});
          assetFetched++;
        }catch(e){errors.push({url:img.url,kind:'failed',error:'asset:'+e.message});}
      }
    }));
  }
  const finished=clock(), counts={pages_visited:seen.size,pages_fetched:pages.length,pages_blocked:errors.filter(x=>x.kind==='blocked'&&!x.error.startsWith('asset:')).length,
    pages_skipped:0,pages_failed:errors.filter(x=>x.kind==='failed'&&!x.error.startsWith('asset:')).length,
    ...(captureAssets?{images_fetched:assetFetched,images_failed:errors.filter(x=>x.error.startsWith('asset:')).length}:{})};
  if(runId && !/^scrp_[0-9a-f]{24}$/.test(runId)) throw Error('invalid site.scrape runId');
  const run_id=runId||'scrp_'+sha(Buffer.from(JSON.stringify([seed,started]))).slice(0,24);
  const status=!pages.length?'failed':errors.length?'partial':'completed';
  return {schema_version:SITE_SCRAPE_SCHEMA,capability:SITE_SCRAPE_CAPABILITY,run_id,status,runtime,
    started_at:new Date(started).toISOString(),completed_at:new Date(finished).toISOString(),
    content_hash:'sha256:'+sha(Buffer.from(JSON.stringify(pages.map(p=>[p.url,p.title]).sort((a,b)=>a[0].localeCompare(b[0]))))),
    seed_urls:[seed],counts,applied:{scope:{sameSite:true,maxPages},policy:{respectRobots},
      capture:{metadata:true,text:false,html:false,assets:captureAssets},ignored:UNAVAILABLE_INPUTS},pages,errors};
}
