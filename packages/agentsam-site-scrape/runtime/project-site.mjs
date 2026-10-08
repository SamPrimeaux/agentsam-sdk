/** Resolve site origin from the selected project's own source config, never an
 * AgentSam publisher fallback, unrelated ALLOWED_ORIGINS or random web search. */
import fs from 'node:fs';
import path from 'node:path';
import {parse as parseJsonc} from 'jsonc-parser';
import {assertPublicUrl} from './secure-fetch.mjs';
import {verifyLocalArchive} from './node-storage.mjs';

function normalizeSeed(value) {
 if(typeof value!=='string'||!value.trim())throw Error('site seed must be a nonempty URL');
 return assertPublicUrl(value.trim());
}
function candidateConfig(root) {
 const filename=path.join(root,'.agentsam','site-scrape.json');
 if(!fs.existsSync(filename))return null;
 const config=JSON.parse(fs.readFileSync(filename,'utf8'));
 return config.site?.url||config.site?.seed_url||config.seed_url||null;
}
export function resolveProjectSeed(projectRoot,{url}={}) {
 const root=fs.realpathSync(projectRoot);
 if(url)return {url:normalizeSeed(url),source:'explicit-user-url'};
 const projectSeed=candidateConfig(root);
 if(projectSeed)return {url:normalizeSeed(projectSeed),source:'project:.agentsam/site-scrape.json'};
 const domains=new Set();
 for(const name of ['wrangler.toml','wrangler.jsonc','wrangler.json']) {
  const file=path.join(root,name);
  if(!fs.existsSync(file))continue;
  let routes=[];
  if(name==='wrangler.toml') {
   const source=fs.readFileSync(file,'utf8');
   routes=source.split(/\[\[routes\]\]/).slice(1).map(block=>({
     pattern:block.match(/\bpattern\s*=\s*["']([^"']+)["']/)?.[1],
     custom_domain:/\bcustom_domain\s*=\s*true\b/.test(block),
   })).filter(item=>item.custom_domain&&item.pattern);
  }else {
   const j=parseJsonc(fs.readFileSync(file,'utf8'));
   routes=(j?.routes||[]).filter(item=>item.custom_domain&&item.pattern);
  }
  for(const route of routes){
   const value=route.pattern.replace(/^https?:\/\//,'').split('/')[0].toLowerCase();
   if(value.includes('*')||value.includes(':')||value.includes(' '))continue;
   domains.add(value.replace(/^www\./,''));
  }
 }
 if(domains.size===1)return {url:normalizeSeed('https://'+[...domains][0]+'/'),source:'project-wrangler-custom-domain'};
 if(domains.size>1)throw Error('Multiple project website domains detected; use `agentsam site index https://YOUR-SITE` or set site.url in .agentsam/site-scrape.json.');
 throw Error('No crawl archive or project site URL. Set `.agentsam/site-scrape.json` site.url or run `agentsam site index https://YOUR-SITE` (no R2 required).');
}

/** Find *only* this project's recorded private crawl archives, never scan its
 * source tree, download a missing manifest or guess another project's R2. */
export function latestProjectArchive(projectRoot,{archiveDir}={}) {
 const root=fs.realpathSync(projectRoot);
 const dir=path.resolve(archiveDir||path.join(root,'.agentsam','crawls'));
 if(!fs.existsSync(dir))return null;
 const found=[];
 const walk=(current,depth)=>{
  if(depth>8||found.length>1000)return;
  for(const item of fs.readdirSync(current,{withFileTypes:true})) {
   if(item.isSymbolicLink())continue;
   const next=path.join(current,item.name);
   if(item.isFile()&&item.name==='manifest.json'){
    const parent=path.dirname(next);
    try{
     const manifest=verifyLocalArchive(parent);
     found.push({root:parent,run_id:manifest.run_id,mtime:fs.statSync(next).mtimeMs});
    }catch{/* corrupt/incomplete runs are not eligible for auto indexing */}
   }else if(item.isDirectory()&&depth<8)walk(next,depth+1);
  }
 };
 walk(dir,0);
 found.sort((a,b)=>b.mtime-a.mtime||b.run_id.localeCompare(a.run_id));
 return found[0]||null;
}
