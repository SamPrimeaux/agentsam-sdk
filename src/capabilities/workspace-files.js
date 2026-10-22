/** Workspace-scoped file operations for the AgentSam harness. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_BYTES=512*1024;
const SKIP_DIRS=new Set(['.git','node_modules','.agentsam','.next','dist','build','coverage','.venv','venv']);
const PROTECTED=new Set(['.git','node_modules','.env','.npmrc','.pypirc','.netrc','.ssh','.aws','.config','.agentsam']);
const unsafePart=(part)=>PROTECTED.has(part)||part.startsWith('.env.')||part.endsWith('.pem')||part.endsWith('.key');
const hash=(value)=>crypto.createHash('sha256').update(value).digest('hex');
function scope(root,filename,{create=false}={}){
 if(!root || typeof filename !== 'string' || !filename || path.isAbsolute(filename)) throw new Error('workspace_relative_path_required');
 const absoluteRoot=fs.realpathSync(root);
 const requested=path.resolve(absoluteRoot,filename);
 if(requested===absoluteRoot || !requested.startsWith(absoluteRoot+path.sep)) throw new Error('workspace_path_outside_root');
 const relative=path.relative(absoluteRoot,requested);
 if(relative.split(path.sep).some(unsafePart)) throw new Error('workspace_protected_path');
 const parent=path.dirname(requested);
 if(!fs.existsSync(parent))throw new Error('workspace_parent_not_found');
 const realParent=fs.realpathSync(parent);
 if(realParent!==absoluteRoot && !realParent.startsWith(absoluteRoot+path.sep)) throw new Error('workspace_symlink_escape');
 if(fs.existsSync(requested) && fs.lstatSync(requested).isSymbolicLink())throw new Error('workspace_symlink_not_allowed');
 return {root:absoluteRoot,filename:requested,relative};
}
export function workspaceRead(input={},projectRoot){
 const target=scope(projectRoot,input.path);
 let stat;
 try { stat=fs.statSync(target.filename); }
 catch(error) { if(error?.code==='ENOENT')throw new Error('workspace_path_not_found'); throw error; }
 if(!stat.isFile())throw new Error('workspace_not_regular_file');
 if(stat.size>MAX_BYTES)throw new Error('workspace_read_limit_exceeded');
 const content=fs.readFileSync(target.filename,'utf8');
 if(content.includes('\0'))throw new Error('workspace_binary_file_unsupported');
 return {path:target.relative,content,sha256:hash(content),bytes:stat.size,verified:true};
}
export function workspaceWrite(input={},projectRoot){
 const target=scope(projectRoot,input.path,{create:true});
 if(typeof input.content!=='string'||Buffer.byteLength(input.content)>MAX_BYTES||input.content.includes('\0'))throw new Error('workspace_write_content_invalid');
 const exists=fs.existsSync(target.filename);
 const previous=exists?fs.readFileSync(target.filename):null;
 if(previous){
  if(previous.length>MAX_BYTES)throw new Error('workspace_write_existing_file_too_large');
  if(!input.expected_sha256 || input.expected_sha256!==hash(previous))throw new Error('workspace_write_conflict_expected_sha256_required');
 }else if(input.expected_sha256)throw new Error('workspace_write_conflict_file_missing');
 const temporary=target.filename+'.agentsam-'+crypto.randomBytes(6).toString('hex')+'.tmp';
 try{
  fs.writeFileSync(temporary,input.content,{mode:0o600,flag:'wx'});
  fs.renameSync(temporary,target.filename);
 }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
 return {path:target.relative,sha256:hash(input.content),bytes:Buffer.byteLength(input.content),written:true};
}

/**
 * Bounded, read-only filesystem discovery. No symlink traversal, hidden
 * credential stores, git objects, or compiled dependency trees are exposed.
 */
function boundedRoot(projectRoot,requested='.') {
 const root=fs.realpathSync(projectRoot);
 if(typeof requested!=='string'||requested.length>300||path.isAbsolute(requested))throw new Error('workspace_relative_path_required');
 const target=path.resolve(root,requested);
 if(target!==root&&!target.startsWith(root+path.sep))throw new Error('workspace_path_outside_root');
 const parts=path.relative(root,target).split(path.sep).filter(Boolean);
 if(parts.some(unsafePart))throw new Error('workspace_protected_path');
 if(!fs.existsSync(target))throw new Error('workspace_path_not_found');
 if(fs.lstatSync(target).isSymbolicLink())throw new Error('workspace_symlink_not_allowed');
 const real=fs.realpathSync(target);
 if(real!==root&&!real.startsWith(root+path.sep))throw new Error('workspace_symlink_escape');
 if(!fs.statSync(real).isDirectory())throw new Error('workspace_not_directory');
 return {root,dir:real};
}
function walk(input={},projectRoot,visit=()=>{}) {
 const {root,dir}=boundedRoot(projectRoot,input.path||'.');
 const maxEntries=Math.max(1,Math.min(300,Number.isInteger(input.max_entries)?input.max_entries:100));
 const maxDepth=Math.max(1,Math.min(5,Number.isInteger(input.depth)?input.depth:3));
 const result=[],pending=[{dir,level:0}];
 let seen=0,truncated=false;
 while(pending.length){
   const {dir:current,level}=pending.shift();
   let files=fs.readdirSync(current,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name));
   for(const file of files){
     if(seen>=maxEntries){truncated=true;break;}
     const name=file.name;
     if(unsafePart(name)||SKIP_DIRS.has(name)||name.startsWith('.'))continue;
     const absolute=path.join(current,name);
     if(file.isSymbolicLink())continue;
     if(!file.isFile()&&!file.isDirectory())continue;
     const relative=path.relative(root,absolute).split(path.sep).join('/');
     const isDir=file.isDirectory();
     const entry={path:relative,type:isDir?'directory':'file'};
     if(!isDir){const stat=fs.statSync(absolute);entry.bytes=stat.size;}
     result.push(entry);seen++;
     visit(entry,absolute);
     if(isDir&&level+1<maxDepth)pending.push({dir:absolute,level:level+1});
   }
   if(truncated)break;
 }
 return {root:path.relative(root,dir)||'.',entries:result,truncated,limit:maxEntries,depth:maxDepth};
}
export function workspaceList(input={},projectRoot){
 const result=walk(input,projectRoot);
 return {schema:'sam.workspace.list.v1',...result};
}
export function workspaceSearch(input={},projectRoot){
 if(typeof input.query!=='string'||input.query.trim().length<2||input.query.length>160)
   throw new Error('workspace_search_query_invalid');
 const term=input.query.toLowerCase();
 const limit=Math.max(1,Math.min(30,Number.isInteger(input.limit)?input.limit:15));
 const matches=[];
 const result=walk({path:input.path||'.',depth:input.depth??4,max_entries:input.max_entries??200},
  projectRoot,(entry,absolute)=>{
   if(matches.length>=limit||entry.type!=='file'||entry.bytes>128*1024)return;
   if(/\.(?:png|jpe?g|webp|gif|pdf|ico|woff2?|ttf|otf|zip|gz|sqlite|db|lock|map)$/i.test(entry.path))return;
   let content;
   try{content=fs.readFileSync(absolute,'utf8');}catch{return;}
   if(content.includes('\0'))return;
   const lines=content.split(/\r?\n/);
   for(let i=0;i<lines.length&&matches.length<limit;i++){
    const index=lines[i].toLowerCase().indexOf(term);
    if(index<0)continue;
    matches.push({path:entry.path,line:i+1,
      snippet:lines[i].slice(Math.max(0,index-90),Math.min(lines[i].length,index+term.length+150))});
   }
  });
 return {schema:'sam.workspace.search.v1',query:input.query,matches,
  inspected_entries:result.entries.length,truncated:result.truncated||matches.length>=limit,
  scope:result.root};
}


/** File/directory metadata under the same workspace scope contract. */
export function workspaceStat(input={},projectRoot){
 const requested=input.path;
 if(typeof requested!=='string'||!requested)throw new Error('workspace_relative_path_required');
 if(requested==='.' ){
  const {dir}=boundedRoot(projectRoot,'.');
  return {path:'.',type:'directory',bytes:null,sha256:null};
 }
 const target=scope(projectRoot,requested);
 let stat;
 try { stat=fs.statSync(target.filename); }
 catch(error) { if(error?.code==='ENOENT')throw new Error('workspace_path_not_found'); throw error; }
 if(stat.isDirectory())return {path:target.relative,type:'directory',bytes:null,sha256:null};
 if(!stat.isFile())throw new Error('workspace_not_regular_file');
 let digest=null;
 if(stat.size<=MAX_BYTES){
  try { digest=hash(fs.readFileSync(target.filename)); }
  catch(error) { if(error?.code==='ENOENT')throw new Error('workspace_path_not_found'); throw error; }
 }
 return {path:target.relative,type:'file',bytes:stat.size,sha256:digest};
}

/** Apply one exact unique text replacement after a source-hash check. */
export function workspacePatch(input={},projectRoot){
 if(typeof input.old_text!=='string'||!input.old_text)throw new Error('workspace_patch_old_text_required');
 if(typeof input.new_text!=='string')throw new Error('workspace_patch_new_text_invalid');
 const current=workspaceRead({path:input.path},projectRoot);
 if(typeof input.expected_sha256!=='string'||input.expected_sha256!==current.sha256)
  throw new Error('workspace_write_conflict_expected_sha256_required');
 const occurrences=current.content.split(input.old_text).length-1;
 if(occurrences===0)throw new Error('workspace_patch_old_text_not_found');
 if(occurrences!==1)throw new Error('workspace_patch_old_text_ambiguous');
 const content=current.content.replace(input.old_text,input.new_text);
 const result=workspaceWrite({path:input.path,content,expected_sha256:input.expected_sha256},projectRoot);
 return {...result,patched:true};
}

/** Delete one regular file only; never recursively remove directories. */
export function workspaceRemove(input={},projectRoot){
 const target=scope(projectRoot,input.path);
 if(!fs.existsSync(target.filename))throw new Error('workspace_remove_file_not_found');
 const stat=fs.statSync(target.filename);
 if(!stat.isFile())throw new Error('workspace_not_regular_file');
 const previous=fs.readFileSync(target.filename);
 if(previous.length>MAX_BYTES)throw new Error('workspace_write_existing_file_too_large');
 if(typeof input.expected_sha256!=='string'||input.expected_sha256!==hash(previous))
  throw new Error('workspace_write_conflict_expected_sha256_required');
 if(hash(fs.readFileSync(target.filename))!==input.expected_sha256)
  throw new Error('workspace_write_conflict_expected_sha256_required');
 fs.unlinkSync(target.filename);
 return {path:target.relative,sha256:input.expected_sha256,bytes:previous.length,removed:true};
}
