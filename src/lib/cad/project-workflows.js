import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export const CAD_PROJECT_WORKFLOWS=[
 {key:'cad.house_baseline',description:'Validate, save, reopen, build, inspect, render and export an editable courtyard baseline.',requires:['project.valid_candidate','native.blender.available'],provides:['project.saved','model.inspected','preview.rendered','export.glb'],steps:['validate','save','reopen','build','inspect','render','export']},
 {key:'cad.edit_preview',description:'Read, atomically edit, reopen, build, inspect, render and export a saved project.',requires:['project.saved','project.expected_revision','native.blender.available'],provides:['project.revised','model.inspected','preview.rendered','export.glb'],steps:['read','edit','reopen','build','inspect','render','export']}
];
const tools={validate:'design_project_validate',save:'design_project_save',read:'design_project_get',edit:'design_apply_operation',reopen:'design_project_get',build:'design_model_build',inspect:'design_model_inspect',render:'design_model_render',export:'design_model_export'};
export async function runProjectWorkflow(runtime,key,input,{evidenceRoot}={}){
 const definition=CAD_PROJECT_WORKFLOWS.find(w=>w.key===key);if(!definition)throw new Error('unknown_cad_workflow');
 const evidence={run_id:randomUUID(),workflow_key:key,status:'running',started_at:Math.floor(Date.now()/1000),steps:[]};
 const record=()=>{if(evidenceRoot){fs.mkdirSync(evidenceRoot,{recursive:true});const file=path.join(evidenceRoot,evidence.run_id+'.json');fs.writeFileSync(file+'.tmp',JSON.stringify(evidence,null,2));fs.renameSync(file+'.tmp',file);}};
 let row;
 record();
 try{
 for(const step of definition.steps){
  const args=step==='validate'?{project:input.project}:step==='save'?{project:input.project,expected_revision:input.expected_revision??0}:
   step==='read'?{project_id:input.project_id}:step==='edit'?{project_id:input.project_id,expected_revision:input.expected_revision,operation:input.operation}:
   {...{project_id:row.project.id,revision:row.revision},...(step==='export'?{format:'glb'}:{})};
  if(step==='edit'&&row.revision!==input.expected_revision)throw new Error('revision_conflict');
  const result=await runtime.execute(tools[step],args);
  if(step==='validate'&&!result.valid)throw new Error('project_invalid:'+JSON.stringify(result.errors));
  if(step==='reopen'&&(result.content_hash!==row.content_hash||result.revision!==row.revision))throw new Error('reopen_verification_failed');
  if(['save','read','edit','reopen'].includes(step))row=result;
  evidence.steps.push({node_key:step,tool_name:tools[step],status:'completed',result});record();
 }
 evidence.status='completed';evidence.verified_results={project_id:row.project.id,revision:row.revision,content_hash:row.content_hash,facts:definition.provides};
 }catch(error){evidence.status='failed';evidence.error=error.message;throw error;}
 finally{evidence.completed_at=Math.floor(Date.now()/1000);record();}
 return evidence;
}
