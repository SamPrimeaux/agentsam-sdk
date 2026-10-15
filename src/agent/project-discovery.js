/**
 * Read-only project capability detection for first-run AgentSam adoption.
 * Never provisions an index, uploads content or rewrites a provider binding.
 * Proposals are hints; the host remains the owner of its existing toolchain.
 */
import fs from 'node:fs';
import path from 'node:path';

function safeJson(filename) {
 try{return JSON.parse(fs.readFileSync(filename,'utf8'));}catch{return null;}
}
function has(root,filename){return fs.existsSync(path.join(root,filename));}
function read(root,filename){
 try{return fs.readFileSync(path.join(root,filename),'utf8').slice(0,100000);}catch{return '';}
}

export function discoverProjectCapabilities(root){
 const repo=fs.realpathSync(root);
 const pkg=safeJson(path.join(repo,'package.json'));
 const agentsam=safeJson(path.join(repo,'.agentsam/config.json'));
 const knowledge=safeJson(path.join(repo,'.agentsam/knowledge.json'));
 const wrangler=read(repo,'wrangler.toml')||read(repo,'wrangler.jsonc')||read(repo,'wrangler.json');
 const signals=[],suggestions=[];
 const register=(id,evidence,detail)=>signals.push({id,evidence,detail});
 if(has(repo,'.git'))register('git','.git','Existing repository history');
 if(pkg)register('node','package.json','Existing package scripts and dependencies');
 if(pkg?.scripts?.test||pkg?.scripts?.verify)register('checks','package.json scripts','Existing test/verification commands');
 if(pkg?.scripts?.deploy)register('deploy','package.json scripts.deploy','Existing project-owned deploy workflow');
 if(wrangler){
  register('cloudflare','wrangler config','Existing Cloudflare project configuration');
  if(/vectorize|VECTORIZE/i.test(wrangler))register('vectorize','wrangler configuration','Existing Vectorize binding or index reference');
  if(/\[\[d1_databases\]\]/.test(wrangler))register('d1','wrangler configuration','Existing D1 binding');
  if(/\[\[r2_buckets\]\]/.test(wrangler))register('r2','wrangler configuration','Existing R2 binding');
 }
 if(knowledge)register('knowledge','.agentsam/knowledge.json','Existing AgentSam knowledge configuration');
 if(agentsam)register('agentsam','.agentsam/config.json','Existing AgentSam project configuration');
 if(has(repo,'pyproject.toml')||has(repo,'requirements.txt'))register('python','pyproject.toml / requirements.txt','Existing Python tooling');
 if(has(repo,'Cargo.toml'))register('rust','Cargo.toml','Existing Rust tooling');
 if(has(repo,'.mcp.json')||has(repo,'mcp.json'))register('mcp','MCP config','Existing MCP integration');
 if(signals.some(x=>x.id==='vectorize'))suggestions.push({id:'vectorize',message:'Reuse the existing Vectorize lane through an explicit host adapter; do not create a replacement index.'});
 if(pkg?.scripts?.deploy)suggestions.push({id:'deploy',message:'Prefer the project-owned deploy script after inspecting the build and release plan.'});
 if(knowledge)suggestions.push({id:'knowledge',message:'Inspect existing knowledge status and retrieve from it before scheduling another full index.'});
 else suggestions.push({id:'knowledge-plan',message:'Offer a read-only knowledge index plan; creation must be approved.'});
 if(signals.some(x=>x.id==='checks'))suggestions.push({id:'checks',message:'Use the project verification scripts rather than assuming a preset test command.'});
 return {schema:'agentsam.project.discovery.v1',root:repo,signals,suggestions,
  automatic_changes:false,provider_setup_required:null};
}
