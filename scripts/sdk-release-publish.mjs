#!/usr/bin/env node
/** Dependency ordered AgentSam public release-train publisher; plan mode is read-only. */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mode=process.argv[2]||'--plan';
if(!['--plan','--publish','--publish-local'].includes(mode))throw Error('expected --plan, --publish or --publish-local');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sdk=read(path.join(root,'package.json')),version=sdk.version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('stable_sdk_version_required');
const ignored=new Set(['node_modules','dist','build','.git','.wrangler','.agentsam','target','.output']);
const independent=new Set([
 '@inneranimalmedia/agentsam-provider-completeful',
 '@inneranimalmedia/agentsam-merch',
]);
const entries=[];
function scan(dir){
 if(!fs.existsSync(dir))return;
 for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  if(ignored.has(item.name))continue;
  const p=path.join(dir,item.name);
  if(item.isDirectory())scan(p);
  else if(item.name==='package.json'){
   const rel=path.relative(root,p).replaceAll(path.sep,'/');
   if(rel.startsWith('apps/ecommerce-cms-agentsam/'))continue;
   const manifest=read(p);
   if(manifest.name?.startsWith('@inneranimalmedia/'))
    entries.push({name:manifest.name,manifest,cwd:path.dirname(p),rel});
  }
 }
}
scan(path.join(root,'packages'));scan(path.join(root,'apps'));
// Respect the canonical per-package independent release policy instead of
// maintaining another manual list as first-party apps become installable.
for (const item of entries) if (item.manifest.releaseTrain === 'independent') independent.add(item.name);
const all=new Map(entries.map(x=>[x.name,x]));
if(all.size!==entries.length)throw Error('duplicate_first_party_package');
all.set(sdk.name,{name:sdk.name,manifest:sdk,cwd:root,rel:'package.json'});
const allowed=new Map([...all].filter(([name,x])=>!independent.has(name)&&(name===sdk.name||(x.manifest.private!==true&&x.manifest.publishConfig?.access==='public'))));
if(all.size<65||allowed.size<50)throw Error('incomplete_package_inventory');
// Private source-only workspaces are included in the SDK bundle where needed,
// but they are not published release-train packages and may keep local versions.
for(const x of allowed.values()){
 if(x.manifest.version!==version)throw Error('release_train_drift:'+x.name);
 for(const sec of ['dependencies','devDependencies','peerDependencies','optionalDependencies'])
  for(const [name,spec]of Object.entries(x.manifest[sec]||{}))
   if(all.has(name)&&spec!==(independent.has(name)?all.get(name).manifest.version:version))throw Error('dependency_pin_drift:'+x.name+'->'+name+'@'+spec);
}
const seen=new Set(),active=new Set(),order=[];
function visit(name){
 if(seen.has(name))return;
 if(active.has(name))throw Error('release_dependency_cycle:'+name);
 const x=allowed.get(name);if(!x)throw Error('required_package_not_public:'+name);
 active.add(name);
 for(const sec of ['dependencies','peerDependencies','optionalDependencies'])
  for(const dep of Object.keys(x.manifest[sec]||{})){
   if(!all.has(dep))continue;
   if(independent.has(dep))continue; // separately versioned / published
   if(!allowed.has(dep)){
    if(sec==='peerDependencies'&&x.manifest.peerDependenciesMeta?.[dep]?.optional)continue;
    throw Error('public_package_depends_on_private:'+name+'->'+dep);
   }
   visit(dep);
  }
 active.delete(name);seen.add(name);order.push(x);
}
for(const name of allowed.keys())visit(name);
if(!order.some(x=>x.name===sdk.name))throw Error('sdk_release_node_missing');
if(!sdk.exports?.['./cad-project-v2']||!sdk.files?.includes('services/cad/occt')||!sdk.files?.includes('packages/agentsam-occt')||!sdk.files?.includes('packages/agentsam-3d-viewer'))
 throw Error('cad_v2_occt_viewer_missing_from_distribution');
for(const name of ['src/lib/cad/project-v2.js','packages/agentsam-occt/package.json','packages/agentsam-occt/native/main.cpp','packages/agentsam-occt/native/CMakeLists.txt','packages/agentsam-occt/src/browser.ts','packages/agentsam-3d-viewer/package.json','packages/agentsam-3d-viewer/src/index.js','protocol/cad/cad.project.v2.schema.json'])
 if(!fs.existsSync(path.join(root,name)))throw Error('release_file_missing:'+name);
console.log('AGENTSAM_STABLE_RELEASE '+version+' '+order.length+' packages');
for(const [i,x]of order.entries())console.log(String(i+1).padStart(2,'0')+' '+x.name+'@'+version+' '+path.relative(root,x.cwd));
if(mode==='--plan')process.exit(0);
const localPublish=mode==='--publish-local';
if(localPublish){
 // Local publishing deliberately uses the operator's npm login, never a fabricated CI identity.
 if(process.env.CI==='true'||!process.stdin.isTTY)throw Error('local_publish_requires_interactive_terminal');
 if(process.argv[3]!==`--confirm=${version}`)throw Error(`local_publish_requires_--confirm=${version}`);
 const git=(...args)=>{
  const result=spawnSync('git',args,{cwd:root,encoding:'utf8'});
  if(result.status!==0)throw Error('git_preflight_failed:'+args.join(' '));
  return result.stdout.trim();
 };
 if(git('branch','--show-current')!=='main'||git('status','--porcelain')||git('rev-parse','HEAD')!==git('rev-parse','origin/main'))
  throw Error('local_publish_requires_clean_synchronized_main');
 const auth=spawnSync('npm',['whoami'],{cwd:root,encoding:'utf8'});
 if(auth.status!==0||!auth.stdout.trim())throw Error('npm_login_required_run_npm_login_first');
 console.log('LOCAL_PUBLISH_AUTHENTICATED '+auth.stdout.trim()+' · '+version);
}else if(process.env.CI!=='true'||process.env.GITHUB_REF!=='refs/heads/main'||!process.env.ACTIONS_ID_TOKEN_REQUEST_URL){
 throw Error('publish_requires_approved_main_and_github_oidc');
}
function npm(args,cwd=root,quiet=false){
 const res=spawnSync('npm',args,{cwd,encoding:'utf8',stdio:quiet?['ignore','pipe','pipe']:'inherit'});
 if(!quiet&&res.status!==0)throw Error('npm_failed:'+args.join(' '));
 return res;
}
function exists(name){
 const r=npm(['view',name+'@'+version,'version','--json','--prefer-online','--fetch-retries=0'],root,true);
 if(r.status!==0)return false;
 try{const v=JSON.parse(r.stdout);return v===version||(Array.isArray(v)&&v.includes(version));}
 catch{return false;}
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
for(const item of order){
 if(exists(item.name)){console.log('ALREADY_PUBLISHED '+item.name);continue;}
 const dir=item.cwd;
 console.log('PUBLISH '+item.name+'@'+version);
 const workspace=path.relative(root,dir).replaceAll(path.sep,'/');
 if(dir!==root&&!sdk.workspaces?.includes(workspace)&&fs.existsSync(path.join(dir,'package-lock.json'))){
  // Resolve newly-published SDK dependencies only after they exist on npm.
  npm(['install','--package-lock-only','--ignore-scripts'],dir);
  npm(['ci','--ignore-scripts'],dir);
 }
 npm(['publish','--access','public',...(localPublish?[]:['--provenance'])],dir);
 let confirmed=false;
 for(let attempt=0;attempt<36;attempt++){
  if(exists(item.name)){confirmed=true;break;}
  console.log('WAIT_REGISTRY_VISIBILITY '+item.name+' attempt '+(attempt+1)+'/36');
  await sleep(5000);
 }
 if(!confirmed)throw Error('version_not_visible_after_publish:'+item.name);
}
console.log('AGENTSAM_RELEASE_VERIFIED '+version);
