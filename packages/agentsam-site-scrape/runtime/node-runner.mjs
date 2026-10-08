/** Native Node site.scrape CLI adapter. Optional legacy Python adapter remains
 * in this same package; neither owns site/CMS indexing nor remote credentials. */
import fs from 'node:fs';
import path from 'node:path';
import { crawlSite } from './core.mjs';
import { createSecureFetch } from './secure-fetch.mjs';
import { createLocalArchive, resolveProjectStorage, uploadProjectArchive, verifyLocalArchive } from './node-storage.mjs';

const HELP=`AgentSam site.scrape · native bounded site crawler

Usage:
  agentsam site scrape <https://public-site.example> [options]
  agentsam site storage --project-root <project-directory>
  agentsam site verify <archive-directory>
  agentsam site index <archive-directory>
  agentsam site knowledge plan <archive-directory> --project-root <project-directory>
  agentsam site knowledge index <archive-directory> --project-root <project-directory> [--embed]
  agentsam site knowledge search <query> --project-root <project-directory> [--semantic]
  agentsam site upload <archive-directory> --project-root <project-directory>
  agentsam site worker plan --project-root <dir> [--queue-name <queue>] [--authority-service <worker>]
  agentsam site worker init --project-root <dir> [--queue-name <queue>] [--authority-service <worker>]

Options:
  --project-root <dir>     Project whose configuration/Cloudflare identity owns storage (default cwd)
  --archive-dir <dir>     Local evidence output (default <project>/.agentsam/crawls)
  --account-id <au_id>    Account label for archive namespace (needed for remote upload)
  --project-id <proj_id>  Project label for archive namespace (needed for remote upload)
  --max-pages <N>        Max pages to fetch, 1..5000 (default 20)
  --concurrency <N>      Bounded parallel requests, 1..16 (default 3)
  --capture-assets       Fetch and stage public same-site images (default off)
  --upload-archive       Explicit remote R2 upload after staging (never implicit)
  --archive-bucket <name>  Selected project/customer bucket; overrides project configuration
  --verify-only <path>   Verify a staged local archive, no crawling
  --queue-name <name>    Project-owned Queue physical name
  --worker-name <name>   Project-owned Worker name
  --authority-service <name>  IAM/project permission Worker to bind
  --cms-service <name>  Optional review/attachment Worker to bind
  --help                 Show this guide

Storage authority: CLI choice > project's .agentsam/site-scrape.json >
project's CRAWL_EVIDENCE Wrangler binding > local-only. Never publisher fallback.
A real HTTP crawl obeys robots.txt, public-network boundaries and per-run limits.
`;
function readArgs(args) {
  const options={},positional=[];
  for(let i=0;i<args.length;i++){
    const a=args[i];
    if(['--help','-h','--capture-assets','--upload-archive','--embed','--semantic'].includes(a)){
      const key=a.slice(2).replaceAll('-','_');options[key]=true;continue;
    }
    if(a.startsWith('--')){
      const [k,inline]=a.slice(2).split('=',2);
      if(!['project-root','archive-dir','account-id','project-id','max-pages','concurrency','archive-bucket','verify-only','queue-name','worker-name','authority-service','cms-service'].includes(k)) throw Error('unknown site option: --'+k);
      const value=inline ?? args[++i];
      if(!value || value.startsWith('--'))throw Error('missing value for --'+k);
      options[k.replaceAll('-','_')]=value;
    }else positional.push(a);
  }
  return {options,positional};
}
function projectIdentities(root,opts) {
  const cfg=path.join(root,'.agentsam','site-scrape.json');
  let contents={};if(fs.existsSync(cfg))contents=JSON.parse(fs.readFileSync(cfg,'utf8'));
  return {accountId:opts.account_id||contents.account_id||null,projectId:opts.project_id||contents.project_id||null};
}
export async function runNativeSiteScrape(args, {stdout=process.stdout,stderr=process.stderr,cwd=process.cwd()}={}) {
  try {
    const {options:opts,positional}=readArgs(args);
    if(opts.help||positional.includes('help')||!positional.length){stdout.write(HELP);return 0;}
    const action=positional.shift();
    const projectRoot=fs.realpathSync(path.resolve(cwd,opts.project_root||'.'));
    const print=json=>stdout.write(JSON.stringify(json,null,2)+'\n');
    if(action==='storage') {print(resolveProjectStorage(projectRoot,{bucket:opts.archive_bucket}));return 0;}
    if(action==='knowledge') {
      const task=positional[0], target=positional.slice(1).join(' ');
      if(!['plan','index','search'].includes(task)||!target||
         (task!=='search'&&positional.length!==2)){
        throw Error('site knowledge plan|index <archive> or search <query> is required');
      }
      const {loadVerifiedSiteIndex}=await import('./knowledge.mjs');
      const {readConfig,planIndex,runIndex,retrieve}=await import('../../../src/knowledge/index.js');
      const {openStore,provider}=await import('../../../src/commands/knowledge.js');
      const graph=task==='search'?null:loadVerifiedSiteIndex(path.resolve(cwd,target)).graph;
      const base=readConfig(projectRoot);
      // Isolate site evidence from the repository's active source generation.
      const config={...base,scope:{name:`${base.scope.name}:site-evidence`,include:['sites'],exclude:[]}};
      let store=null;
      try{
        store=await openStore(projectRoot,config,task!=='index').catch(error=>{
          if(task==='plan')return null;throw error;
        });
        if(task==='search') {
          const topK=opts.top_k?Number(opts.top_k):8;
          if(!Number.isInteger(topK)||topK<1||topK>100)throw Error('top-k must be 1..100');
          print(await retrieve({store,config,text:target,semantic:!!opts.semantic,
            embedder:opts.semantic?provider(config.embedding):undefined,topK}));
          return 0;
        }
        const inputs={root:projectRoot,config,store,siteCrawl:graph,embed:!!opts.embed};
        const planned=await planIndex(inputs);
        if(!planned.receipt.files)throw Error('verified archive contains no indexable page content');
        if(task==='plan')print({...planned.receipt,authority:'site-crawl-evidence'});
        else print(await runIndex({...inputs,embedder:opts.embed?provider(config.embedding):undefined}));
        return 0;
      }finally{await store?.close();}
    }

    if(action==='worker') {
      const { projectWorkerPlan, writeProjectWorker }=await import('../worker/project-config.mjs');
      const config={queueName:opts.queue_name,workerName:opts.worker_name,
        authorityService:opts.authority_service,cmsService:opts.cms_service,
        bucket:opts.archive_bucket};
      if(positional.length!==1 || !['plan','init'].includes(positional[0])){
        throw Error('site worker requires `plan` or `init`');
      }
      const result=positional[0]==='plan'?projectWorkerPlan(projectRoot,config):writeProjectWorker(projectRoot,config);
      print(result);return 0;
    }
    if(action==='verify' || action==='index' || opts.verify_only){
      const target=opts.verify_only||positional[0];if(!target)throw Error('site verify requires an archive path');
      const manifest=verifyLocalArchive(path.resolve(cwd,target));
      if(action==='index') {
        print(JSON.parse(fs.readFileSync(path.join(path.resolve(cwd,target),'index.json'),'utf8')));
      } else print({ok:true,run_id:manifest.run_id,objects:manifest.objects.length,prefix:manifest.prefix});
      return 0;
    }
    if(action==='upload') {
      const target=positional[0];
      if(!target || positional.length!==1)throw Error('site upload requires one existing archive directory');
      const archiveRoot=path.resolve(cwd,target);
      const manifest=verifyLocalArchive(archiveRoot);
      const identity=projectIdentities(projectRoot,opts);
      if(identity.accountId&&identity.accountId!==manifest.account_id ||
         identity.projectId&&identity.projectId!==manifest.project_id) {
        throw Error('archive identity does not match the selected project configuration');
      }
      const remote=await uploadProjectArchive({archiveRoot,projectRoot,bucket:opts.archive_bucket});
      print({ok:true,run_id:manifest.run_id,storage:{status:'uploaded',...remote}});
      return 0;
    }
    if(action!=='scrape')throw Error('expected: agentsam site scrape <URL>');
    const seed=positional[0];if(!seed||positional.length>1)throw Error('one public HTTP(S) seed URL is required');
    const maxPages=opts.max_pages?Number(opts.max_pages):20;
    const concurrency=opts.concurrency?Number(opts.concurrency):3;
    const {accountId,projectId}=projectIdentities(projectRoot,opts);
    if(opts.upload_archive &&(!accountId||!projectId))throw Error('remote evidence requires an authorized account/project identity');
    if(opts.upload_archive && resolveProjectStorage(projectRoot,{bucket:opts.archive_bucket}).provider!=='r2'){
      throw Error('remote R2 upload requires project-selected bucket; no publisher fallback');
    }
    const archive=createLocalArchive({projectRoot,archiveDir:opts.archive_dir,accountId,projectId});
    let secure;
    try {
      secure=createSecureFetch({seedUrl:seed});
      const receipt=await crawlSite({url:seed,maxPages,concurrency,captureAssets:!!opts.capture_assets,
        fetchPage:secure.fetchPage,onPage:archive.onPage,onAsset:archive.onAsset});
      const staged=archive.finalize(receipt);
      receipt.storage={status:'staged',prefix:staged.manifest.prefix,archive_path:staged.root};
      if(opts.upload_archive){
        try {
          const remote=await uploadProjectArchive({archiveRoot:staged.root,projectRoot,bucket:opts.archive_bucket});
          receipt.storage={status:'uploaded',prefix:staged.manifest.prefix,bucket:remote.bucket,source:remote.source};
        }catch(error){
          receipt.storage={status:'failed',prefix:staged.manifest.prefix,error:error.message};
          stderr.write(`site.scrape archive upload failed: ${error.message}\n`);
        }
      }
      print(receipt);
      return receipt.status==='failed'||receipt.storage.status==='failed'?1:0;
    }finally{await secure?.close();archive.discard();}
  }catch(error){stderr.write(`site.scrape: ${error.message}\n`);return 2;}
}
