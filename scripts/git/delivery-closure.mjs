#!/usr/bin/env node
/** Non-destructive by default. Close only clean merged sibling worktrees and merged local branches on explicit request. */
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
const args=process.argv.slice(2);
if(args.some(x=>!['--prune-merged','--json','--hook'].includes(x))) {
  console.error('usage: node scripts/git/delivery-closure.mjs [--json] [--prune-merged] [--hook]');
  process.exit(2);
}
const hook=args.includes('--hook');
const prune=args.includes('--prune-merged')||hook;
if(hook) for await (const _ of process.stdin); // a hook host writes one envelope on stdin; drain it
const exec=(argv,cwd=repo)=>execFileSync('git',argv,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const current=exec(['rev-parse','--show-toplevel']);
const main=exec(['rev-parse','origin/main']);
// A squash merge leaves the branch tip outside origin/main. A merged PR whose head commit equals the tip proves the work landed.
const mergedHeads=new Map();
let prNote=null;
try{
  const prs=JSON.parse(execFileSync('gh',['pr','list','--state','merged','--limit','300','--json','headRefName,headRefOid'],{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000}));
  for(const p of prs){ if(!mergedHeads.has(p.headRefName))mergedHeads.set(p.headRefName,new Set()); mergedHeads.get(p.headRefName).add(p.headRefOid); }
}catch{prNote='gh unavailable: squash-merged branches are not recognised';}
// A branch that was only created (never committed to) sits on main's tip and may be a tree an agent has just opened.
const hasOwnCommits=b=>{try{return exec(['reflog','show','--format=%gs',`refs/heads/${b}`]).split('\n').some(x=>x&&!x.startsWith('branch: Created from'));}catch{return true;}};
const isEmpty=(branch,head)=>head===main&&!!branch&&!hasOwnCommits(branch);
const mergedVia=(branch,head)=>{
  if(isEmpty(branch,head))return null;
  try{exec(['merge-base','--is-ancestor',head,'origin/main']);return 'ancestor';}catch{}
  return branch&&mergedHeads.get(branch)?.has(head)?'squash-pr':null;
};
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
 const via=mergedVia(branch,head);
 const merged=via!==null;
 const protectedTree=location===current||location===worktrees[0]?.worktree||branch==='main'||branch==='master'||!!w.detached||!!w.bare;
 return {path:location,branch,head,clean,merged_into_origin_main:merged,merged_via:via,protected:protectedTree,
  action:(!protectedTree&&clean&&merged)?'safe-prune-candidate':!clean?'preserve-dirty':isEmpty(branch,head)?(protectedTree?'preserve-protected':'preserve-empty'):!merged?'preserve-unmerged':'preserve-protected'};
});
// Local branches that no worktree has checked out follow the same rule.
const checkedOut=new Set(audit.map(w=>w.branch).filter(Boolean));
for(const line of exec(['for-each-ref','refs/heads','--format=%(refname:short) %(objectname)']).split('\n').filter(Boolean)) {
 const [branch,head]=line.split(' ');
 if(checkedOut.has(branch)||branch==='main'||branch==='master')continue;
 const via=mergedVia(branch,head);
 audit.push({path:null,branch,head,clean:true,merged_into_origin_main:via!==null,merged_via:via,protected:false,
  action:via?'safe-prune-candidate':isEmpty(branch,head)?'preserve-empty':'preserve-unmerged'});
}
if(prune){
 for(const w of audit.filter(w=>w.action==='safe-prune-candidate')){
   try{
     if(w.path) exec(['worktree','remove',w.path]);
     // -D only when a merged PR head proved a squash merge; the ordinary safe delete is used for real ancestors.
     if(w.branch) exec(['branch',w.merged_via==='ancestor'?'-d':'-D',w.branch]);
     w.action='pruned';
   }catch(e){w.action='prune-failed';w.error=String(e.stderr||e.message).trim().split('\n').pop();}
 }
}
const result={schema:'agentsam.delivery-closure.v1',main,prune_requested:prune,pr_note:prNote,worktrees:audit};
const count=a=>audit.filter(w=>w.action===a).length;
if(hook){
 const out={metadata:{pruned:count('pruned'),preserved_dirty:count('preserve-dirty'),preserved_unmerged:count('preserve-unmerged'),failed:count('prune-failed')}};
 if(count('pruned')||count('prune-failed')) out.user_notification=`delivery-closure: pruned ${count('pruned')} merged worktree/branch(es)`+(count('prune-failed')?`, ${count('prune-failed')} failed`:'')+'.';
 console.log(JSON.stringify(out));
}
else if(args.includes('--json'))console.log(JSON.stringify(result,null,2));
else{
 console.log('main',main,'prune requested',prune);
 for(const w of audit) console.log(w.action.padEnd(22),String(w.branch??'(detached)').padEnd(53),w.path??'(branch only)',w.merged_via?`[${w.merged_via}]`:'');
 if(prNote) console.log('note:',prNote);
}
