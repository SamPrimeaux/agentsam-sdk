#!/usr/bin/env node
/** Non-destructive by default. Close only clean merged sibling worktrees on explicit request. */
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
const args=process.argv.slice(2);
if(args.some(x=>!['--prune-merged','--json'].includes(x))) {
  console.error('usage: node scripts/git/delivery-closure.mjs [--json] [--prune-merged]');
  process.exit(2);
}
const prune=args.includes('--prune-merged');
const exec=(argv,cwd=repo)=>execFileSync('git',argv,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const current=exec(['rev-parse','--show-toplevel']);
const main=exec(['rev-parse','origin/main']);
const worktrees=exec(['worktree','list','--porcelain']).split(/\n\n+/).map(block=>{
 const out={};
 for(const line of block.split('\n')) {
  const i=line.indexOf(' '); if(i>=0)out[line.slice(0,i)]=line.slice(i+1);
  else out[line]=true;
 }
 return out;
});
const audit=worktrees.map(w=>{
 const location=w.worktree;
 const branch=w.branch?.replace(/^refs\/heads\//,'')??null;
 const clean=exec(['status','--porcelain'],location)==='';
 const head=exec(['rev-parse','HEAD'],location);
 let merged=false;
 try{exec(['merge-base','--is-ancestor',head,'origin/main']);merged=true;}catch{}
 const protectedTree=location===current||location===worktrees[0]?.worktree||branch==='main'||branch==='master'||!!w.detached||!!w.bare;
 return {path:location,branch,head,clean,merged_into_origin_main:merged,protected:protectedTree,
  action:(!protectedTree&&clean&&merged)?'safe-prune-candidate':!clean?'preserve-dirty':!merged?'preserve-unmerged':'preserve-protected'};
});
if(prune){
 for(const w of audit.filter(w=>w.action==='safe-prune-candidate')){
   exec(['worktree','remove',w.path]);
   if(w.branch) exec(['branch','-d',w.branch]);
   w.action='pruned';
 }
}
const result={schema:'agentsam.delivery-closure.v1',main,prune_requested:prune,worktrees:audit};
if(args.includes('--json'))console.log(JSON.stringify(result,null,2));
else{
 console.log('main',main,'prune requested',prune);
 for(const w of audit) console.log(w.action.padEnd(22),String(w.branch??'(detached)').padEnd(53),w.path);
}
