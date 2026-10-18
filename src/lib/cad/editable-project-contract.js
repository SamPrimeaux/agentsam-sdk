// Canonical editable CAD contract. Coordinates are inches; display units do not rescale geometry.
export function validateProject(p) {
  const errors = [];
  if (!p || typeof p !== 'object') return {valid:false, errors:['project_required']};
  if (!p.id || !p.name) errors.push('id_and_name_required');
  if (p.scale !== 1) errors.push('coordinate_scale_must_be_one_inch');
  const groups=['walls','rooms','doors','windows','furniture','annotations'];
  const ids=new Set();
  for (const group of groups) {
    if (!Array.isArray(p[group])) { errors.push(group+'_array_required'); continue; }
    for (const e of p[group]) {
      if (!e || typeof e.id !== 'string' || !e.id || ids.has(e.id)) errors.push('invalid_or_duplicate_element_id');
      else ids.add(e.id);
    }
  }
  if(groups.some(g=>!Array.isArray(p[g])))return {valid:false,errors};
  const finite=(v)=>typeof v==='number'&&Number.isFinite(v);
  const positive=(v)=>finite(v)&&v>0;
  for(const w of p.walls||[]) {
    if (!w) continue;
    if (![w.x1,w.y1,w.x2,w.y2].every(finite)||!positive(w.thickness)||!positive(w.height3D)||Math.hypot(w.x2-w.x1,w.y2-w.y1)<1e-6) errors.push('invalid_wall:'+w.id);
  }
  for(const e of [...(p.doors||[]),...(p.windows||[])]) {
    if (!e) continue;
    const w=(p.walls||[]).find(w=>w?.id===e.wallId);
    if (!w) { errors.push('opening_wall_missing:'+e.id); continue; }
    const len=Math.hypot(w.x2-w.x1,w.y2-w.y1), z=e.elevation??0;
    if (!positive(e.width)||!positive(e.height)||!finite(e.distanceAlongWall)||e.distanceAlongWall<0||e.distanceAlongWall>1||!finite(z)||z<0||z+e.height>w.height3D||e.distanceAlongWall*len-e.width/2<0||e.distanceAlongWall*len+e.width/2>len) errors.push('opening_out_of_bounds:'+e.id);
  }
  for(const r of p.rooms||[]) if(!r||!Array.isArray(r.points)||r.points.length<3||!r.points.every(v=>Array.isArray(v)&&v.length===2&&v.every(finite))) errors.push('invalid_room:'+r?.id);
  for(const f of p.furniture||[]) if(!f||![f.x,f.y,f.rotation].every(finite)||![f.w,f.d,f.h].every(positive)) errors.push('invalid_fixture:'+f?.id);
  return {valid:errors.length===0,errors};
}
export function requireValidProject(p) {
 const v=validateProject(p); if(!v.valid) throw new Error(v.errors.join('; ')); return p;
}
export function applyProjectOperation(project, operation) {
 requireValidProject(project);
 const next=structuredClone(project);
 const apply=(op)=>{
  if(!op||typeof op.type!=='string') throw new Error('operation_type_required');
  if(op.type==='batch_operations'||op.type==='convert_sketch_selection') {
   const list=op.operations??op.proposedOperations;
   if(!Array.isArray(list)||list.length>256) throw new Error('invalid_operation_batch');
   list.forEach(apply); return;
  }
  const specs={
   create_wall:['walls','wall'], create_room:['rooms','room'], add_door:['doors','door'],add_window:['windows','window'],add_fixture:['furniture','fixture'],create_parametric_object:['parametricObjects','parametricObject']
  };
  if(specs[op.type]) {const [group,key]=specs[op.type]; if(!op[key])throw new Error(key+'_required'); (next[group]??=[]).push(structuredClone(op[key]));return;}
  const updates={update_wall:['walls','wallId'],update_room:['rooms','roomId'],update_door:['doors','doorId'],update_window:['windows','windowId'],update_fixture:['furniture','fixtureId']};
  const deletes={delete_wall:['walls','wallId'],delete_room:['rooms','roomId'],delete_door:['doors','doorId'],delete_window:['windows','windowId'],delete_fixture:['furniture','fixtureId'],delete_parametric_object:['parametricObjects','parametricObjectId']};
  const find=(group,id)=>{const e=(next[group]||[]).find(e=>e.id===id);if(!e)throw new Error('element_not_found:'+id);return e;};
  if(updates[op.type]){const [g,k]=updates[op.type];const e=find(g,op[k]);if(!op.updates||('id' in op.updates&&op.updates.id!==e.id))throw new Error('invalid_updates');Object.assign(e,op.updates);return;}
  if(deletes[op.type]){const [g,k]=deletes[op.type];find(g,op[k]);next[g]=next[g].filter(e=>e.id!==op[k]);if(g==='walls'){next.doors=next.doors.filter(e=>e.wallId!==op[k]);next.windows=next.windows.filter(e=>e.wallId!==op[k]);}return;}
  if(op.type==='move_element'){
   if(!Number.isFinite(op.dx)||!Number.isFinite(op.dy))throw new Error('finite_displacement_required');
   const g={wall:'walls',room:'rooms',furniture:'furniture',parametric:'parametricObjects'}[op.elementType];
   if(!g)throw new Error('unsupported_move_type:'+op.elementType);
   const e=find(g,op.elementId);
   if(g==='walls'){e.x1+=op.dx;e.x2+=op.dx;e.y1+=op.dy;e.y2+=op.dy;}
   else if(g==='rooms') e.points=e.points.map(([x,y])=>[x+op.dx,y+op.dy]);
   else if(g==='parametricObjects'){e.transform.x+=op.dx;e.transform.y+=op.dy;e.transform.z+=op.dz??0;}
   else {e.x+=op.dx;e.y+=op.dy;}return;
  }
  if(op.type==='set_lighting'){next.lighting={...next.lighting,...op.lighting};return;}
  if(op.type==='attach_sketch'){next.sketchDocument=structuredClone(op.sketchDocument);return;}
  if(op.type==='update_parametric_parameter'){const e=find('parametricObjects',op.parametricObjectId);e.parameters[op.parameterName]=op.value;return;}
  if(op.type==='update_parametric_source'){find('parametricObjects',op.parametricObjectId).source=op.source;return;}
  throw new Error('unsupported_operation:'+op.type);
 };
 apply(operation);requireValidProject(next);
 next.version=(project.version||1)+1;next.updatedAt=Date.now();
 return next;
}
