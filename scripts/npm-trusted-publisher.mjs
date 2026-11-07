#!/usr/bin/env node
/**
 * Operator-approved npm trusted-publisher provisioning for the AgentSam train.
 * Plan mode never touches npm or GitHub. Apply needs interactive npm web auth.
 * No long-lived NPM_TOKEN or automatic trusted-publisher revocation.
 */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const run=(cmd,args,{quiet=false}={})=>spawnSync(cmd,args,{cwd:root,encoding:'utf8',
  stdio:quiet?['ignore','pipe','pipe']:'inherit'});
const version=JSON.parse((await import('node:fs')).readFileSync(path.join(root,'package.json'),'utf8')).version;
const args=process.argv.slice(2);
const apply=args.includes('--apply');
if(args.some(v=>v!=='--plan'&&v!=='--apply'&&v!==`--confirm=${version}`))
  throw Error('usage: node scripts/npm-trusted-publisher.mjs --plan OR --apply --confirm='+version);
if(apply&&!args.includes(`--confirm=${version}`))throw Error('explicit_version_confirmation_required');
if(apply&&(process.env.CI==='true'||!process.stdin.isTTY))throw Error('interactive_operator_required');
const plan=run(process.execPath,['scripts/sdk-release-publish.mjs','--plan'],{quiet:true});
if(plan.status!==0)throw Error('sdk_release_plan_failed');
const packages=plan.stdout.split('\n').map(line=>{
  const match=line.match(/^\d{2} (@inneranimalmedia\/[^\s@]+)@(\d+\.\d+\.\d+)/);
  return match&&match[2]===version?match[1]:null;
}).filter(Boolean);
if(packages.length<50||new Set(packages).size!==packages.length)throw Error('invalid_release_package_inventory');
console.log('NPM_TRUST_STABLE_PLAN '+version+' packages='+packages.length);
if(!apply){
  for(const name of packages)console.log('PLAN '+name);
  console.log('\nNo npm account modifications performed.');
  console.log('Apply on clean synchronized main: node scripts/npm-trusted-publisher.mjs --apply --confirm='+version);
  process.exit(0);
}
const git=(...argv)=>{
  const r=run('git',argv,{quiet:true});
  if(r.status!==0)throw Error('git_preflight_failed');
  return r.stdout.trim();
};
if(git('branch','--show-current')!=='main'||git('status','--porcelain')||
   git('rev-parse','HEAD')!==git('rev-parse','origin/main'))
  throw Error('trust_setup_requires_clean_synchronized_main');
const npm=run('npm',['--version'],{quiet:true});
const parts=npm.stdout.trim().split('.').map(Number);
if(npm.status!==0||parts[0]<11||(parts[0]===11&&parts[1]<15))
  throw Error('npm_11_15_or_newer_required');
if(run('npm',['whoami'],{quiet:true}).status!==0)throw Error('npm_login_required');
let configured=0,skipped=0;
for(const name of packages) {
  // This check proves the package name has at least one published version;
  // new names cannot accept trusted-publisher configuration yet.
  if(run('npm',['view',name,'name','--prefer-online','--fetch-retries=0'],{quiet:true}).status!==0){
    console.log('SKIP_UNPUBLISHED '+name);skipped++;continue;
  }
  // npm trust list can fail when no configuration exists; let npm trust github
  // enforce its own duplicate protection. Never revoke a prior publisher.
  const listed=run('npm',['trust','list',name,'--json'],{quiet:true});
  if(listed.status===0){
    let parsed;
    try{parsed=JSON.parse(listed.stdout);}catch{throw Error('trust_list_unparseable:'+name);}
    if(JSON.stringify(parsed).includes('publish-stable.yml')){
      console.log('ALREADY_TRUSTED '+name);skipped++;continue;
    }
    if(Array.isArray(parsed)&&parsed.length>0 ||
       parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&Object.keys(parsed).length>0)
      throw Error('EXISTING_TRUST_NEEDS_REVIEW:'+name);
  }
  console.log('CONFIGURE_TRUST '+name);
  const result=run('npm',['trust','github',name,'--repo','SamPrimeaux/agentsam-sdk',
    '--file','publish-stable.yml','--allow-publish','--yes']);
  if(result.status!==0)throw Error('TRUST_CONFIGURATION_FAILED:'+name);
  configured++;
  await new Promise(resolve=>setTimeout(resolve,2000));
}
console.log('NPM_TRUST_FINISHED configured='+configured+' skipped='+skipped+' total='+packages.length);
