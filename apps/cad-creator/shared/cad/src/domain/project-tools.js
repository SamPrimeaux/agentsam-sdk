export const CAD_PROJECT_TOOLS = [
 ['design_project_get','Read an editable CAD project revision','design.read'],
 ['design_project_validate','Validate inch-based CAD project geometry and references','design.read'],
 ['design_apply_operation','Apply an atomic typed edit with revision conflict detection','design.write'],
 ['design_project_save','Save an immutable CAD project revision','design.write'],
 ['design_project_restore','Restore saved geometry as a new revision','design.write'],
 ['design_model_build','Build a real Blender model from an editable CAD project','design.write'],
 ['design_model_inspect','Inspect a verified revision model','design.read'],
 ['design_model_render','Render a courtyard PNG from a revision model','design.export'],
 ['design_model_export','Export a revision model as GLB STL or OBJ','design.export']
].map(([name,description,capability_key])=>{
 const fields={
 expected_content_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},project_id:{type:'string',pattern:'^[A-Za-z0-9_-]{1,100}$'},revision:{type:'integer',minimum:1},expected_revision:{type:'integer',minimum:0},
 project:{type:'object'},operation:{type:'object',required:['type']},format:{type:'string',enum:['glb','stl','obj']},message:{type:'string',maxLength:2000}};
 const allowed=name==='design_project_get'?['project_id','revision','expected_content_hash']:name==='design_project_save'?['project','expected_revision','message']:
 name==='design_project_validate'?['project','project_id','revision']:
 name==='design_apply_operation'?['project_id','expected_revision','operation','message']:
 name==='design_project_restore'?['project_id','revision','expected_revision']:
 name==='design_model_export'?['project_id','revision','format']:['project_id','revision'];
 const required=name==='design_project_validate'?[]:name==='design_project_save'?['project','expected_revision']:
 name==='design_apply_operation'?['project_id','expected_revision','operation']:
 name==='design_project_restore'?['project_id','revision','expected_revision']:['project_id'];
 return {name,description,capability_key,input_schema:{type:'object',properties:Object.fromEntries(allowed.map(k=>[k,fields[k]])),required,additionalProperties:false,...(name==='design_project_validate'?{anyOf:[{required:['project']},{required:['project_id']}]}:{})},output_schema:{type:'object'}};
});
