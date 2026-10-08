/** Workspace-scoped file operations for the AgentSam harness. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_BYTES=512*1024;
const hash=(value)=>crypto.createHash('sha256').update(value).digest('hex');
function scope(root,filename,{create=false}={}){
 if(!root || typeof filename !== 'string' || !filename || path.isAbsolute(filename)) throw new Error('workspace_relative_path_required');
 const absoluteRoot=fs.realpathSync(root);
 const requested=path.resolve(absoluteRoot,filename);
 if(requested===absoluteRoot || !requested.startsWith(absoluteRoot+path.sep)) throw new Error('workspace_path_outside_root');
 const relative=path.relative(absoluteRoot,requested);
 if(relative.split(path.sep).some(part=>part==='.git'||part==='node_modules'||part==='.env'||part.startsWith('.env.'))) throw new Error('workspace_protected_path');
 const parent=path.dirname(requested);
 if(!fs.existsSync(parent))throw new Error('workspace_parent_not_found');
 const realParent=fs.realpathSync(parent);
 if(realParent!==absoluteRoot && !realParent.startsWith(absoluteRoot+path.sep)) throw new Error('workspace_symlink_escape');
 if(fs.existsSync(requested) && fs.lstatSync(requested).isSymbolicLink())throw new Error('workspace_symlink_not_allowed');
 return {root:absoluteRoot,filename:requested,relative};
}
export function workspaceRead(input={},projectRoot){
 const target=scope(projectRoot,input.path);
 const stat=fs.statSync(target.filename);
 if(!stat.isFile())throw new Error('workspace_not_regular_file');
 if(stat.size>MAX_BYTES)throw new Error('workspace_read_limit_exceeded');
 const content=fs.readFileSync(target.filename,'utf8');
 if(content.includes('\0'))throw new Error('workspace_binary_file_unsupported');
 return {path:target.relative,content,sha256:hash(content),bytes:stat.size,verified:true};
}
export function workspaceWrite(input={},projectRoot){
 const target=scope(projectRoot,input.path,{create:true});
 if(typeof input.content!=='string'||Buffer.byteLength(input.content)>MAX_BYTES)throw new Error('workspace_write_content_invalid');
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
