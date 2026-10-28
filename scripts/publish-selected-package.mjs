#!/usr/bin/env node
// Publish exactly one independently versioned package via protected GitHub Actions.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const targets=Object.freeze({
  completeful:'packages/providers/completeful',
  merch:'packages/agentsam-merch',
  ecommerce:'apps/ecommerce-cms-agentsam'
});
const fail=reason=>{throw new Error('selected_package_release:'+reason)};
const json=rel=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const npm=(args,opts={})=>spawnSync('npm',args,{cwd:root,encoding:'utf8',...opts});
const [mode,target,...rest]=process.argv.slice(2);
if(rest.length||!['--plan','--check','--publish'].includes(mode))fail('usage: --plan|--check|--publish completeful|merch|ecommerce');
const dir=targets[target]; if(!dir)fail('unknown_package:'+target);
const p=json(dir+'/package.json');
if(!p.name?.startsWith('@inneranimalmedia/')||p.private===true||p.publishConfig?.access!=='public'||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(p.version))fail('invalid_package_manifest');
if(target==='ecommerce'){
 for(const f of ['agentsam.app.json','package-lock.json','npm-shrinkwrap.json']){
  const m=json(dir+'/'+f);
  if(m.version!==p.version||(m.packages?.['']&&m.packages[''].version!==p.version))fail('ecommerce_version_drift:'+f);
 }
}
console.log('SELECTED_RELEASE '+p.name+'@'+p.version+' from '+dir);
if(mode==='--publish'){
 if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REF!=='refs/heads/main'||!process.env.NODE_AUTH_TOKEN)fail('publish_requires_approved_main_workflow');
 if(npm(['whoami']).status!==0)fail('npm_auth_required');
 const lookup=npm(['view',p.name+'@'+p.version,'version','--json','--fetch-retries=1']);
 if(lookup.status===0)fail('immutable_version_already_published');
 if(!/\bE404\b/.test((lookup.stderr||'')+(lookup.stdout||'')))fail('npm_registry_lookup_failed');
 const publish=npm(['publish','--prefix',dir,'--access','public','--provenance'],{stdio:'inherit'});
 if(publish.status!==0)fail('npm_publish_failed');
 if(npm(['view',p.name+'@'+p.version,'version','--json','--fetch-retries=3']).status!==0)fail('npm_publication_unverified');
 console.log('PUBLISHED '+p.name+'@'+p.version);
}
