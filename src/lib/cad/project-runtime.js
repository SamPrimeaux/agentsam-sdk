import fs from 'node:fs';
import path from 'node:path';
import {validateProject,applyProjectOperation} from './project-contract.js';
import {projectToBlenderRecipe} from './project-recipe.js';
import {blenderBuild,blenderInspect,blenderRenderPreview,blenderExport} from './blender.js';
import {CAD_PROJECT_TOOLS} from '../../../apps/cad-creator/shared/cad/src/domain/project-tools.js';
export {CAD_PROJECT_TOOLS};
export function createProjectRuntime({store,artifactRoot,native={blenderBuild,blenderInspect,blenderRenderPreview,blenderExport},onProjectChanged=()=>{}}){
 const root=path.resolve(artifactRoot);
 async function execute(name,args={}){
  const descriptor=CAD_PROJECT_TOOLS.find(t=>t.name===name);
  if(!descriptor)throw new Error('unknown_design_tool');
  if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('invalid_tool_input');
  for(const key of Object.keys(args))if(!Object.hasOwn(descriptor.input_schema.properties,key))throw new Error('unknown_argument:'+key);
  for(const key of descriptor.input_schema.required)if(args[key]===undefined)throw new Error('argument_required:'+key);
  for(const key of ['revision','expected_revision'])if(args[key]!==undefined&&(!Number.isInteger(args[key])||args[key]<(key==='revision'?1:0)))throw new Error('invalid_'+key);
  if(args.project_id!==undefined&&!/^[A-Za-z0-9_-]{1,100}$/.test(args.project_id))throw new Error('invalid_project_id');
  if(name==='design_project_validate')return validateProject(args.project??(await store.read(args.project_id,args.revision)).project);
  if(name==='design_project_get'){const row=await store.read(args.project_id,args.revision);if(args.expected_content_hash&&row.content_hash!==args.expected_content_hash)throw new Error('reopen_verification_failed');return row;}
  let saved;
  if(name==='design_project_save')saved=await store.save(args.project,args.expected_revision,args.message);
  if(name==='design_project_restore')saved=await store.restore(args.project_id,args.revision,args.expected_revision);
  if(name==='design_apply_operation'){
   const current=await store.read(args.project_id);
   if(current.revision!==args.expected_revision)throw new Error('revision_conflict');
   saved=await store.save(applyProjectOperation(current.project,args.operation),args.expected_revision,args.message??args.operation.type);
  }
  if(saved){await onProjectChanged(saved);return saved;}
  const row=await store.read(args.project_id,args.revision);
  // Store validates ids. Artifact paths never come from a caller-supplied path.
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(row.project.id))throw new Error('invalid_project_id');
  const dir=path.join(root,row.project.id,String(row.revision)), blend=path.join(dir,'model.blend'), receipt=path.join(dir,'build.json');
  fs.mkdirSync(dir,{recursive:true});
  let result;
  if(name==='design_model_build'){
   if(fs.existsSync(receipt)){const prior=JSON.parse(fs.readFileSync(receipt,'utf8'));if(prior.content_hash!==row.content_hash)throw new Error('artifact_revision_conflict');}
   result=await native.blenderBuild({output:blend,recipe:projectToBlenderRecipe(row.project),timeoutSeconds:120});
   fs.writeFileSync(receipt,JSON.stringify({content_hash:row.content_hash,artifact:result.artifact}));
  }else{
   const prior=JSON.parse(fs.readFileSync(receipt,'utf8'));
   if(prior.content_hash!==row.content_hash)throw new Error('artifact_revision_conflict');
   const {sha256File}=await import('./blender.js');
   if(sha256File(blend)!==prior.artifact.sha256)throw new Error('model_digest_mismatch');
   if(name==='design_model_inspect')result=await native.blenderInspect({input:blend});
   if(name==='design_model_render')result=await native.blenderRenderPreview({input:blend,output:path.join(dir,'courtyard.png'),width:1024,height:768,timeoutSeconds:120});
   if(name==='design_model_export'){if(!['glb','stl','obj'].includes(args.format??'glb'))throw new Error('invalid_format');result=await native.blenderExport({input:blend,output:path.join(dir,'model.'+(args.format??'glb')),format:args.format??'glb'});}
  }
  const out={...result,project_id:row.project.id,revision:row.revision,content_hash:row.content_hash};
  fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(out,null,2));return out;
 }
 return {execute,catalog:()=>CAD_PROJECT_TOOLS};
}
