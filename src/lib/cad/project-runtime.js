import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createOcctNativeProvider} from './occt-native-provider.mjs';
import {validateProject,applyProjectOperation} from './project-contract.js';
import {projectToBlenderRecipe} from './project-recipe.js';
import {blenderBuild,blenderInspect,blenderRenderPreview,blenderExport} from './blender.js';
import {CAD_PROJECT_TOOLS} from './project-tools.js';
export {CAD_PROJECT_TOOLS};
export function createProjectRuntime({store,artifactRoot,native={blenderBuild,blenderInspect,blenderRenderPreview,blenderExport},occt=createOcctNativeProvider(),onProjectChanged=()=>{}}){
 const root=path.resolve(artifactRoot);
 async function execute(name,args={}){
  const descriptor=CAD_PROJECT_TOOLS.find(t=>t.name===name);
  if(!descriptor)throw new Error('unknown_design_tool');
  if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('invalid_tool_input');
  for(const key of Object.keys(args))if(!Object.hasOwn(descriptor.input_schema.properties,key))throw new Error('unknown_argument:'+key);
  for(const key of descriptor.input_schema.required)if(args[key]===undefined)throw new Error('argument_required:'+key);
  for(const key of ['revision','expected_revision'])if(args[key]!==undefined&&(!Number.isInteger(args[key])||args[key]<(key==='revision'?1:0)))throw new Error('invalid_'+key);
  if(args.project_id!==undefined&&!/^[A-Za-z0-9_-]{1,100}$/.test(args.project_id))throw new Error('invalid_project_id');
  if(name==='design_project_validate'&&args.project===undefined&&args.project_id===undefined)throw new Error('argument_required:project_or_project_id');
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
  // A native solid is a typed parametric object attached to the immutable project revision.
  // It does not claim to replace the complete architectural Blender model.
  const stepFile=path.join(dir,'model.step'),occtReceipt=path.join(dir,'occt-build.json');
  const verifiedStep=()=>{
   if(!fs.existsSync(occtReceipt))throw new Error('occt_build_required');
   const prior=JSON.parse(fs.readFileSync(occtReceipt,'utf8'));
   if(prior.content_hash!==row.content_hash)throw new Error('artifact_revision_conflict');
   if(!fs.existsSync(stepFile))throw new Error('occt_step_missing');
   const digest=crypto.createHash('sha256').update(fs.readFileSync(stepFile)).digest('hex');
   if(digest!==prior.artifact?.sha256)throw new Error('occt_step_digest_mismatch');
   return prior;
  };
  if(name==='design_model_build'&&args.engine==='occt'){
   const object=(row.project.parametricObjects||[]).find(o=>o.id===args.parametric_object_id);
   if(!object||object.generator!=='occt'||object.generatorTemplate!=='box'||object.source!=='occt:box')
    throw new Error('occt_project_primitive_required');
   const {width,depth,height}=object.parameters||{};
   if(![width,depth,height].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v*25.4<=1000000))
    throw new Error('occt_project_dimensions_invalid');
   if(fs.existsSync(occtReceipt)){
    const prior=verifiedStep();
    if(prior.parametric_object_id!==object.id)throw new Error('occt_revision_primitive_conflict');
    return prior;
   }
   const created=await occt.execute('design_model_build',{kind:'box',width,depth,height,units:'in'},{artifactRoot:dir});
   fs.renameSync(created.artifact.path,stepFile);
   const out={...created,artifact:{...created.artifact,path:stepFile},
    project_id:row.project.id,revision:row.revision,content_hash:row.content_hash,
    parametric_object_id:object.id,source:'cad.project.v1'};
   fs.writeFileSync(occtReceipt,JSON.stringify(out,null,2));
   return out;
  }
  if((name==='design_model_inspect'&&args.engine==='occt')||
     (name==='design_model_export'&&args.format==='step')){
   const prior=verifiedStep();
   if(name==='design_model_export')return {...prior,operation:'design_model_export',format:'step'};
   const inspected=await occt.execute('design_model_inspect',{artifact:{path:stepFile}},{artifactRoot:dir});
   if(Math.abs(inspected.volume_mm3-prior.volume_mm3)>Math.max(1e-5,prior.volume_mm3*1e-6))
    throw new Error('occt_step_volume_mismatch');
   return {...inspected,project_id:row.project.id,revision:row.revision,
     content_hash:row.content_hash,parametric_object_id:prior.parametric_object_id};
  }
  if(args.engine!==undefined)throw new Error('unsupported_design_engine');
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
 return {execute,catalog:()=>CAD_PROJECT_TOOLS,nativeDoctor:()=>occt.doctor()};
}
