/**
 * Installation-scoped local project lifecycle.
 * Does not invent a global project database; the created project's own
 * .agentsam/project.json is its authoritative metadata.
 *
 * Delete = archive; preserve all original work, allow restoration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const fail = code => Object.assign(new Error(code), {code});
const slug = value => {
  if(typeof value !== 'string' || !ID_RE.test(value))throw fail('project_id_invalid');
  return value;
};
function rootState(workspaceRoot) {
  const root=fs.realpathSync(workspaceRoot);
  const projects=path.join(root,'projects');
  const archive=path.join(root,'.agentsam','archive','projects');
  return {root,projects,archive};
}
function directory(root,relative) {
  const target=path.resolve(root,relative);
  if(target===root || !target.startsWith(root+path.sep))throw fail('project_outside_workspace');
  let probe=target;
  while (probe!==root) {
    if (fs.existsSync(probe) && fs.lstatSync(probe).isSymbolicLink())
      throw fail('project_symlink_not_allowed');
    probe=path.dirname(probe);
  }
  return target;
}
function location(workspaceRoot,id) {
  const w=rootState(workspaceRoot), projectId=slug(id);
  return {...w,id:projectId,target:directory(w.root,path.join('projects',projectId))};
}
function metadata(filename) {
  if(!fs.existsSync(filename))throw fail('project_not_found');
  const stat=fs.lstatSync(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32000)throw fail('project_metadata_invalid');
  const doc=JSON.parse(fs.readFileSync(filename,'utf8'));
  if(doc.schema!=='agentsam.project.v1'||!ID_RE.test(doc.id)||!Number.isInteger(doc.revision))
    throw fail('project_metadata_invalid');
  return doc;
}
function projectDoc(dir) {
  if(!fs.existsSync(dir) || !fs.lstatSync(dir).isDirectory()) throw fail('project_not_found');
  return metadata(path.join(dir,'.agentsam','project.json'));
}
function save(filename,value,{newFile=false}={}) {
  const data=JSON.stringify(value,null,2)+'\n';
  const temp=filename+'.'+randomUUID()+'.tmp';
  fs.writeFileSync(temp,data,{mode:0o600,flag:'wx'});
  try{
    if(newFile&&fs.existsSync(filename))throw fail('project_already_exists');
    fs.renameSync(temp,filename);
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function label(value, field, maximum) {
  if(typeof value!=='string'||value.trim().length<1||value.length>maximum)
    throw fail('project_'+field+'_invalid');
  return value.trim();
}
export function listProjects(workspaceRoot) {
  const {root,projects}=rootState(workspaceRoot);
  if(!fs.existsSync(projects))return {schema:'agentsam.project.list.v1',projects:[]};
  const names=fs.readdirSync(projects,{withFileTypes:true})
    .filter(x=>x.isDirectory()&&ID_RE.test(x.name)).map(x=>x.name);
  const resources=[];
  for(const id of names){
    try{
      const loc=location(root,id);
      directory(loc.root,path.join('projects',loc.id,'.agentsam','project.json'));
  const doc=projectDoc(loc.target);
      if(doc.id===id)resources.push(doc);
    }catch{/* invalid/dangling dirs do not become registered project resources */}
  }
  resources.sort((a,b)=>a.id.localeCompare(b.id));
  return {schema:'agentsam.project.list.v1',projects:resources};
}
export function getProject(workspaceRoot,input={}) {
  const loc=location(workspaceRoot,input.id);
  directory(loc.root,path.join('projects',loc.id,'.agentsam','project.json'));
  const doc=projectDoc(loc.target);
  if(doc.id!==loc.id)throw fail('project_identity_mismatch');
  return {...doc,path:path.relative(loc.root,loc.target)};
}
export function createProject(workspaceRoot,input={}) {
  const loc=location(workspaceRoot,input.id);
  if(fs.existsSync(loc.target))throw fail('project_already_exists');
  const name=label(input.name,'name',160);
  const description=typeof input.description==='string' ? input.description.slice(0,4000) : '';
  if(input.description!==undefined&&typeof input.description!=='string')throw fail('project_description_invalid');
  if(Object.keys(input).some(x=>!['id','name','description'].includes(x)))throw fail('project_unknown_input');
  if(fs.existsSync(loc.projects)&&fs.lstatSync(loc.projects).isSymbolicLink())throw fail('project_symlink_not_allowed');
  fs.mkdirSync(loc.projects,{recursive:true,mode:0o700});
  // Exclusive mkdir is the collision guard; never modify an existing project.
  fs.mkdirSync(loc.target,{mode:0o700});
  try{
    fs.mkdirSync(path.join(loc.target,'.agentsam'),{mode:0o700});
    const now=new Date().toISOString();
    const doc={schema:'agentsam.project.v1',id:loc.id,name,description,revision:1,
      created_at:now,updated_at:now,status:'active'};
    save(path.join(loc.target,'.agentsam','project.json'),doc,{newFile:true});
    return {...doc,path:path.relative(loc.root,loc.target),created:true};
  }catch(e){fs.rmSync(loc.target,{recursive:true,force:true});throw e;}
}
export function editProject(workspaceRoot,input={}) {
  const loc=location(workspaceRoot,input.id);
  const doc=getProject(workspaceRoot,{id:loc.id});
  if(!Number.isInteger(input.expected_revision)||input.expected_revision!==doc.revision)
    throw fail('project_revision_conflict');
  if(input.name===undefined&&input.description===undefined)throw fail('project_no_changes');
  if(Object.keys(input).some(x=>!['id','name','description','expected_revision'].includes(x)))
    throw fail('project_unknown_input');
  const name=input.name===undefined?doc.name:label(input.name,'name',160);
  if(input.description!==undefined&&(typeof input.description!=='string'||input.description.length>4000))
    throw fail('project_description_invalid');
  const updated={...doc,name,description:input.description??doc.description,
    revision:doc.revision+1,updated_at:new Date().toISOString()};
  delete updated.path;
  save(path.join(loc.target,'.agentsam','project.json'),updated);
  return {...updated,path:path.relative(loc.root,loc.target),edited:true};
}
export function deleteProject(workspaceRoot,input={}) {
  const loc=location(workspaceRoot,input.id);
  const doc=getProject(workspaceRoot,{id:loc.id});
  if(input.confirm_id!==loc.id)throw fail('project_delete_confirmation_required');
  if(!Number.isInteger(input.expected_revision)||input.expected_revision!==doc.revision)
    throw fail('project_revision_conflict');
  if(Object.keys(input).some(x=>!['id','confirm_id','expected_revision'].includes(x)))
    throw fail('project_unknown_input');
  directory(loc.root,path.join('.agentsam','archive','projects'));
  fs.mkdirSync(loc.archive,{recursive:true,mode:0o700});
  if(fs.lstatSync(loc.archive).isSymbolicLink())throw fail('project_symlink_not_allowed');
  const archiveId=loc.id+'-'+randomUUID();
  const dest=directory(loc.root,path.join('.agentsam','archive','projects',archiveId));
  fs.renameSync(loc.target,dest);
  // Keep original files unchanged. The archived identity is a separate record.
  return {schema:'agentsam.project.delete.v1',id:loc.id,archived:true,
    restore_ref:path.relative(loc.root,dest),previous_revision:doc.revision};
}
export function restoreProject(workspaceRoot,input={}) {
  const loc=location(workspaceRoot,input.id);
  const archiveRef=String(input.restore_ref||'');
  if(!archiveRef.startsWith('.agentsam/archive/projects/'+loc.id+'-')||
     archiveRef.split('/').length!==4)throw fail('project_restore_ref_invalid');
  const src=directory(loc.root,archiveRef);
  const doc=projectDoc(src);
  if(doc.id!==loc.id)throw fail('project_identity_mismatch');
  if(fs.existsSync(loc.target))throw fail('project_already_exists');
  fs.mkdirSync(loc.projects,{recursive:true,mode:0o700});
  fs.renameSync(src,loc.target);
  return {...doc,path:path.relative(loc.root,loc.target),restored:true};
}
