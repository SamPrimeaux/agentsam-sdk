import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {CAD_PROJECT_TOOLS} from '../src/lib/cad/project-runtime.js';
import {CAD_PROJECT_WORKFLOWS} from '../src/lib/cad/project-workflows.js';
const dir=new URL('../registry/cad-project/',import.meta.url);
const json=v=>JSON.stringify(v);
const quote=v=>v==null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const digest=v=>createHash('sha256').update(json(v)).digest('hex');
const insert=(table,row)=>'INSERT INTO '+table+' ('+Object.keys(row).join(',')+') VALUES ('+Object.values(row).map(quote).join(',')+') ON CONFLICT DO NOTHING;';
const upsert=(table,row,conflictKeys=['id'],preserve=[])=>{
 const columns=Object.keys(row);
 const updateColumns=columns.filter(key=>!conflictKeys.includes(key)&&!preserve.includes(key));
 return 'INSERT INTO '+table+' ('+columns.join(',')+') VALUES ('+Object.values(row).map(quote).join(',')+') ON CONFLICT('+conflictKeys.join(',')+') DO UPDATE SET '+updateColumns.map(key=>key+'=excluded.'+key).join(',')+';';
};
const tools=CAD_PROJECT_TOOLS.map(t=>{
 const input_schema={type:'object',properties:{sdk_root:{type:'string',pattern:'^/'},project_root:{type:'string',pattern:'^/'},connection_id:{type:'string'},input:t.input_schema},required:['sdk_root','project_root','input'],additionalProperties:false};
 const handler_config={operation:t.name,execution_lane:'local',contract:'cad.project.v1',schema_sha256:digest(t.input_schema)};
 return {id:'ast_cad_v1_'+t.name,tool_name:t.name,tool_key:t.name,tool_code:t.name,display_name:t.name,tool_category:'design',handler_type:'terminal',handler_key:'cad_project',description:t.description,input_schema:json(input_schema),output_schema:json(t.output_schema),handler_config:json(handler_config),capability_key:t.capability_key,domain:'design',is_active:0,oauth_visible:0,connector_visible:0,requires_approval:0,risk_level:t.capability_key==='design.read'?'low':'medium',dispatch_target:'internal',route_key:'design_studio',notes:'cad.project.v1: local SDK execution verified; hosted binding deployment and end-to-end proof required before activation'};
});
const toolByName=Object.fromEntries(tools.map(t=>[t.tool_name,t]));
const actionNames={validate:'design_project_validate',save:'design_project_save',read:'design_project_get',edit:'design_apply_operation',reopen:'design_project_get',build:'design_model_build',inspect:'design_model_inspect',render:'design_model_render',export:'design_model_export'};
const workflows=CAD_PROJECT_WORKFLOWS.map(w=>{
 const id='wf_'+w.key.replaceAll('.','_')+'_v1',baseline=w.key==='cad.house_baseline',saved=baseline?'save':'edit';
 const projectId=baseline?'$.initial_input.project.id':'$.initial_input.project_id';
 const inputs={
 validate:{project:'$.initial_input.project'},
 save:{project:'$.initial_input.project',expected_revision:0},
 read:{project_id:projectId},
 edit:{project_id:projectId,expected_revision:'$.initial_input.expected_revision',operation:'$.initial_input.operation'},
 reopen:{project_id:projectId,revision:'$.prior_outputs.'+saved+'.revision',expected_content_hash:'$.prior_outputs.'+saved+'.content_hash'},
 };
 const nodes=w.steps.map((step,i)=>{
  const tool=toolByName[actionNames[step]];
  const input=inputs[step]||{project_id:projectId,revision:'$.prior_outputs.'+saved+'.revision',...(step==='export'?{format:'glb'}:{})};
  return {id:id+'_'+step,workflow_id:id,node_key:step,node_kind:'action',title:step,resolution_mode:'pinned',capability_key:tool.capability_key,pinned_tool_id:tool.id,
  config_json:json({operation:tool.tool_name,input_map_only:true,input_map:{sdk_root:'$.initial_input.sdk_root',project_root:'$.initial_input.project_root',input}}),
  input_schema_json:tool.input_schema,output_schema_json:tool.output_schema,retry_policy_json:'{"max_attempts":1}',timeout_ms:180000,ui_json:json({x:0,y:i*120})};
 });
 const edges=nodes.slice(1).map((n,i)=>({id:id+'_edge_'+i,workflow_id:id,from_node_key:nodes[i].node_key,to_node_key:n.node_key,condition_type:'status',condition_json:'{"from_status":"success"}'}));
 return {row:{id,workflow_key:w.key,revision:1,scope_type:'platform',display_name:w.key,description:w.description,entry_node_key:nodes[0].node_key,lifecycle:'draft',
 input_schema_json:json({type:'object',required:baseline?['sdk_root','project_root','project']:['sdk_root','project_root','project_id','expected_revision','operation']}),
 output_schema_json:'{"type":"object"}',metadata_json:json({contract:'cad.project.v1',goap:{requires:w.requires,provides:w.provides,effects_require_completed_execution:true},activation:{local:'verified',hosted:'pending'}})},nodes,edges};
});
const product={
 app_id:'cad-creator',
 slug:'cad-creator',
 capability_keys:['design.read','design.write','design.export'],
 cli_commands:[{id:'agentsam:cad:project',command:'agentsam cad project',description:'Editable CAD project operations and workflows'}]
};
const manifest={contract:'cad.project.v1',product,tools,workflows};
const statements=[
 '-- Generated by node scripts/cad-registry.mjs. No new tables. Inactive until hosted proof.',
 '-- One-time APP.id alignment: agentsam_products.slug agentsam-cad-creator → cad-creator (no-op if already renamed).',
 "UPDATE agentsam_products SET slug="+quote(product.slug)+
  ", metadata=json_set(COALESCE(metadata,'{}'),'$.app_id',"+quote(product.app_id)+",'$.legacy_slug','agentsam-cad-creator')"+
  ", updated_at=unixepoch()"+
  " WHERE slug='agentsam-cad-creator'"+
  " AND NOT EXISTS (SELECT 1 FROM agentsam_products WHERE slug="+quote(product.slug)+");",
];
for(const t of tools){
 statements.push(upsert('agentsam_tools',t,['id'],['is_active']));
 statements.push(upsert('agentsam_tool_capabilities',{tool_id:t.id,capability_key:t.capability_key,is_primary:1,operations_json:json([t.tool_name])},['tool_id','capability_key']));
}
for(const w of workflows){
 statements.push(upsert('agentsam_workflows',w.row,['id'],['lifecycle']));
 for(const n of w.nodes)statements.push(upsert('agentsam_workflow_nodes',n,['id']));
 for(const e of w.edges)statements.push(upsert('agentsam_workflow_edges',e,['id']));
}
statements.push(
 "UPDATE agentsam_products SET metadata=json_set(COALESCE(metadata,'{}'),'$.app_id',"+quote(product.app_id)+",'$.capabilities',json("+quote(json(product.capability_keys))+"),'$.cli_commands',json("+quote(json(product.cli_commands))+"),'$.cad_project_contract','cad.project.v1'), updated_at=unixepoch() WHERE slug="+quote(product.slug)+";"
);
for(const t of tools){
 statements.push(
  "INSERT INTO asset_relationships (source_type,source_id,target_type,target_id,relationship_type,metadata) "+
  "SELECT 'agentsam_product',p.id,'agentsam_tool',"+quote(t.id)+",'exposes_tool',"+quote(json({origin:'registry/cad-project',contract:'cad.project.v1',capability_key:t.capability_key,tool_name:t.tool_name}))+
  " FROM agentsam_products p WHERE p.slug="+quote(product.slug)+
  " ON CONFLICT(source_type,source_id,target_type,target_id,relationship_type) DO UPDATE SET metadata=excluded.metadata;"
 );
}
for(const w of workflows){
 statements.push(
  "INSERT INTO asset_relationships (source_type,source_id,target_type,target_id,relationship_type,metadata) "+
  "SELECT 'agentsam_product',p.id,'agentsam_workflow',"+quote(w.row.id)+",'provides_workflow',"+quote(json({origin:'registry/cad-project',contract:'cad.project.v1',workflow_key:w.row.workflow_key}))+
  " FROM agentsam_products p WHERE p.slug="+quote(product.slug)+
  " ON CONFLICT(source_type,source_id,target_type,target_id,relationship_type) DO UPDATE SET metadata=excluded.metadata;"
 );
}
for(const command of product.cli_commands){
 statements.push(
  "INSERT INTO asset_relationships (source_type,source_id,target_type,target_id,relationship_type,metadata) "+
  "SELECT 'agentsam_product',p.id,'cli_command',"+quote(command.id)+",'exposes_command',"+quote(json({origin:'registry/cad-project',contract:'cad.project.v1',command:command.command,description:command.description}))+
  " FROM agentsam_products p WHERE p.slug="+quote(product.slug)+
  " ON CONFLICT(source_type,source_id,target_type,target_id,relationship_type) DO UPDATE SET metadata=excluded.metadata;"
 );
}
const outputs={'manifest.json':JSON.stringify(manifest,null,2)+'\n','migration.sql':statements.join('\n')+'\n'};
for(const [file,content] of Object.entries(outputs)){const url=new URL(file,dir);if(process.argv.includes('--check')){if(fs.readFileSync(url,'utf8')!==content)throw new Error('registry_drift:'+file);}else{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(url,content);}}
console.log(process.argv.includes('--check')?'CAD registry definitions match source':'CAD registry definitions generated');
