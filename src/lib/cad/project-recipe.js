import {requireValidProject} from './project-contract.js';
// Native geometry is metres, Z-up. Names preserve editable element identifiers.
export function projectToBlenderRecipe(project) {
 requireValidProject(project);
 if((project.parametricObjects||[]).length)throw new Error('parametric_objects_require_compilation');
 if(project.roofType!=='none')throw new Error('roof_geometry_not_supported_yet');
 const operations=[{op:'clear_scene'}], m=0.0254;
 const box=(name,x,y,z,w,d,h,a=0)=>operations.push({op:'add',primitive:'cube',name,size:1,location:[x*m,y*m,z*m],scale:[w*m,d*m,h*m],rotation:[0,0,a]});
 for(const w of project.walls){
  const len=Math.hypot(w.x2-w.x1,w.y2-w.y1),a=Math.atan2(w.y2-w.y1,w.x2-w.x1);
  const opening=[...project.doors,...project.windows].filter(e=>e.wallId===w.id).map(e=>({start:e.distanceAlongWall*len-e.width/2,end:e.distanceAlongWall*len+e.width/2,z:e.elevation??0,h:e.height})).sort((a,b)=>a.start-b.start);
  let cursor=0,part=0;
  const segment=(s,e,z,h)=>{if(e-s>1e-6&&h>1e-6){const t=(s+e)/2;box(w.id+':'+part++,w.x1+Math.cos(a)*t,w.y1+Math.sin(a)*t,z+h/2,e-s,w.thickness,h,a);}};
  for(const o of opening){if(o.start<cursor-1e-6)throw new Error('overlapping_openings:'+w.id);segment(cursor,o.start,0,w.height3D);segment(o.start,o.end,0,o.z);segment(o.start,o.end,o.z+o.h,w.height3D-o.z-o.h);cursor=o.end;}
  segment(cursor,len,0,w.height3D);
 }
 // Only axis-aligned rectangular floor polygons are currently compiled; fail explicitly for others.
 for(const r of project.rooms){
  const xs=[...new Set(r.points.map(p=>p[0]))],ys=[...new Set(r.points.map(p=>p[1]))];
  if(r.points.length!==4||xs.length!==2||ys.length!==2||new Set(r.points.map(p=>p.join(','))).size!==4||r.points.some((p,i)=>{const q=r.points[(i+1)%4];return p[0]!==q[0]&&p[1]!==q[1];}))throw new Error('non_rectangular_floor:'+r.id);
  box(r.id,(xs[0]+xs[1])/2,(ys[0]+ys[1])/2,-2,Math.abs(xs[1]-xs[0]),Math.abs(ys[1]-ys[0]),4);
 }
 for(const f of project.furniture)box(f.id,f.x,f.y,f.h/2,f.w,f.d,f.h,(f.rotation||0)*Math.PI/180);
 const xs=project.walls.flatMap(w=>[w.x1,w.x2]),ys=project.walls.flatMap(w=>[w.y1,w.y2]);
 if(!xs.length)throw new Error('model_requires_walls');
 const cx=(Math.min(...xs)+Math.max(...xs))/2*m,cy=(Math.min(...ys)+Math.max(...ys))/2*m, span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))*m;
 operations.push({op:'add_camera',name:'Courtyard',location:[cx,cy+span*1.4,span],rotation:[Math.atan(1.4),0,Math.PI],lens:40,active:true},{op:'add_light',name:'Sun',type:'SUN',energy:3,rotation:[0.5,-0.4,-0.5]});
 if(operations.length>256)throw new Error('recipe_operation_limit_exceeded');
 return {schema_version:1,units:{system:'METRIC',scale_length:1,length_unit:'METERS'},operations};
}
