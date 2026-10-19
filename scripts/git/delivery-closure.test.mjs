import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,existsSync,chmodSync,realpathSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const script=path.join(path.dirname(fileURLToPath(import.meta.url)),'delivery-closure.mjs');
const ENV={...process.env,GIT_AUTHOR_NAME:'t',GIT_AUTHOR_EMAIL:'t@e.invalid',GIT_COMMITTER_NAME:'t',GIT_COMMITTER_EMAIL:'t@e.invalid',GIT_CONFIG_GLOBAL:os.devNull,GIT_CONFIG_SYSTEM:os.devNull};
const git=(cwd,...a)=>execFileSync('git',a,{cwd,env:ENV,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const commit=(cwd,file)=>{writeFileSync(path.join(cwd,file),file);git(cwd,'add',file);git(cwd,'commit','-m',`add ${file}`);return git(cwd,'rev-parse','HEAD');};

function fixture(){
 const root=realpathSync(mkdtempSync(path.join(os.tmpdir(),'closure-')));
 const origin=path.join(root,'origin.git'),main=path.join(root,'main'),wts=path.join(root,'wts');
 mkdirSync(wts);
 git(root,'init','--bare','-b','main',origin);
 git(root,'clone',origin,main);
 git(main,'checkout','-b','main');
 commit(main,'a.txt');
 git(main,'push','-u','origin','main');
 mkdirSync(path.join(main,'scripts/git'),{recursive:true});
 copyFileSync(script,path.join(main,'scripts/git/delivery-closure.mjs'));
 return {root,main,wts};
}
function branch(f,name,{commits=true,dirty=false}={}){
 const dir=path.join(f.wts,name.replace('/','_'));
 git(f.main,'worktree','add','-b',name,dir,'main');
 const sha=commits?commit(dir,`${name.replace('/','_')}.txt`):git(dir,'rev-parse','HEAD');
 if(dirty)writeFileSync(path.join(dir,'scratch.txt'),'unsaved');
 return {dir,sha};
}
const fastForward=(f,name)=>{git(f.main,'merge','--ff-only',name);git(f.main,'push','origin','main');};
let seq=0;
const squash=(f,sha)=>{commit(f.main,`other-${seq++}.txt`);git(f.main,'cherry-pick',sha);git(f.main,'push','origin','main');}; // same content, different commit: not an ancestor
function fakeGh(f,merged){ // merged=null simulates gh being unavailable
 const bin=path.join(f.root,'bin');mkdirSync(bin,{recursive:true});
 const body=merged===null?'#!/bin/sh\nexit 1\n':`#!/bin/sh\nif [ "$4" = "merged" ]; then echo '${JSON.stringify(merged)}'; else echo '[]'; fi\n`;
 writeFileSync(path.join(bin,'gh'),body);chmodSync(path.join(bin,'gh'),0o755);
 return bin;
}
const run=(f,bin,args)=>spawnSync(process.execPath,[path.join(f.main,'scripts/git/delivery-closure.mjs'),...args],{cwd:f.main,env:{...ENV,PATH:`${bin}${path.delimiter}${process.env.PATH}`},encoding:'utf8',input:'{}'});
const actions=r=>Object.fromEntries(JSON.parse(r.stdout).worktrees.filter(w=>w.branch).map(w=>[w.branch,w]));

test('prunes only merged clean work; keeps WIP, dirty and empty trees; works without gh',()=>{
 const f=fixture(),bin=fakeGh(f,null);
 const merged=branch(f,'feat/merged');fastForward(f,'feat/merged');
 const dirty=branch(f,'feat/dirty',{dirty:true});fastForward(f,'feat/dirty');
 const wip=branch(f,'feat/wip');
 const empty=branch(f,'feat/empty',{commits:false});
 git(f.main,'branch','feat/branch-only',merged.sha); // merged local branch with no worktree
 const r=run(f,bin,['--json','--prune-merged']);
 assert.equal(r.status,0,r.stderr);
 const a=actions(r);
 assert.equal(a['feat/merged'].action,'pruned');
 assert.equal(a['feat/branch-only'].action,'pruned');
 assert.equal(a['feat/dirty'].action,'preserve-dirty');
 assert.equal(a['feat/wip'].action,'preserve-unmerged');
 assert.equal(a['feat/empty'].action,'preserve-empty');
 assert.ok(!existsSync(merged.dir)&&existsSync(dirty.dir)&&existsSync(wip.dir)&&existsSync(empty.dir));
 assert.equal(git(f.main,'branch','--list','feat/merged'),'');
 assert.match(JSON.parse(r.stdout).pr_note,/gh unavailable/);
});

test('the default run changes nothing',()=>{
 const f=fixture(),bin=fakeGh(f,null);
 const m=branch(f,'feat/merged');fastForward(f,'feat/merged');
 const r=run(f,bin,['--json']);
 assert.equal(actions(r)['feat/merged'].action,'safe-prune-candidate');
 assert.ok(existsSync(m.dir));
});

test('a squash merge is recognised only when the merged PR head equals the branch tip',()=>{
 const f=fixture();
 const sq=branch(f,'feat/squashed');squash(f,sq.sha);
 const later=branch(f,'feat/after-pr');const prHead=later.sha;squash(f,prHead);
 const extra=commit(later.dir,'after-pr.txt'); // work added after the PR merged
 const bin=fakeGh(f,[{headRefName:'feat/squashed',headRefOid:sq.sha},{headRefName:'feat/after-pr',headRefOid:prHead}]);
 const r=run(f,bin,['--json','--prune-merged']);
 const a=actions(r);
 assert.equal(a['feat/squashed'].action,'pruned');
 assert.equal(a['feat/squashed'].merged_via,'squash-pr');
 assert.equal(a['feat/after-pr'].action,'preserve-unmerged');
 assert.ok(existsSync(later.dir)&&extra!==prHead);
});

test('hook mode prints exactly one JSON line and prunes',()=>{
 const f=fixture(),bin=fakeGh(f,null);
 const m=branch(f,'feat/merged');fastForward(f,'feat/merged');
 const r=run(f,bin,['--hook']);
 assert.equal(r.status,0,r.stderr);
 const lines=r.stdout.trim().split('\n');
 assert.equal(lines.length,1);
 const out=JSON.parse(lines[0]);
 assert.equal(out.metadata.pruned,1);
 assert.match(out.user_notification,/pruned 1/);
 assert.ok(!existsSync(m.dir));
});
