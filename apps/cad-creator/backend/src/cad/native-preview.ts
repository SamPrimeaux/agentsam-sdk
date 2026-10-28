import os from 'node:os';
import path from 'node:path';
import type {DesignProject} from '@inneranimalmedia/agentsam-cad-shared';
import {planFeatures} from '@inneranimalmedia/agentsam-cad-shared';
import {createOcctSession} from '@inneranimalmedia/agentsam-occt/session';

const idPattern=/^[A-Za-z0-9_-]{1,100}$/;
const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
const bounded=(v:unknown)=>finite(v)&&Math.abs(v as number)<=1000000;
export function validateNativePreviewProject(value:unknown):DesignProject {
 if(!value||typeof value!=='object')throw new Error('cad_preview_project_required');
 const p=value as DesignProject;
 if(!idPattern.test(p.id)||!Array.isArray(p.walls)||!Array.isArray(p.doors)||!Array.isArray(p.windows)||
  p.walls.length>120||p.doors.length+p.windows.length>250||!p.walls.length)throw new Error('cad_preview_project_invalid');
 const ids=new Set<string>();
 for(const w of p.walls){
  if(!w||!idPattern.test(w.id)||ids.has(w.id)||![w.x1,w.y1,w.x2,w.y2].every(bounded)||
   !finite(w.thickness)||w.thickness<=0||w.thickness>120||
   !finite(w.height3D)||w.height3D<=0||w.height3D>2000||
   Math.hypot(w.x2-w.x1,w.y2-w.y1)<.001)throw new Error('cad_preview_wall_invalid');
  ids.add(w.id);
 }
 for(const opening of [...p.doors,...p.windows]){
  if(!opening||!idPattern.test(opening.id)||ids.has(opening.id)||!p.walls.some(w=>w.id===opening.wallId)||
   !finite(opening.width)||opening.width<=0||!finite(opening.height)||opening.height<=0||
   !finite(opening.distanceAlongWall)||opening.distanceAlongWall<0||opening.distanceAlongWall>1)
   throw new Error('cad_preview_opening_invalid');
  const wall=p.walls.find(w=>w.id===opening.wallId)!;
  const length=Math.hypot(wall.x2-wall.x1,wall.y2-wall.y1);
  const elevation='elevation'in opening?opening.elevation:0;
  if(!finite(elevation)||elevation<0||elevation+opening.height>wall.height3D||
   opening.distanceAlongWall*length-opening.width/2<0||
   opening.distanceAlongWall*length+opening.width/2>length)throw new Error('cad_preview_opening_outside_wall');
  ids.add(opening.id);
 }
 return p;
}
/** Disposable, read-only local geometry evaluation: no project writes, no second CAD authority. */
export async function evaluateNativePreview(value:unknown){
 const p=validateNativePreviewProject(value);
 const features=planFeatures(p);
 const binary=process.env.AGENTSAM_OCCT_BIN||path.join(os.homedir(),'.agentsam','bin','agentsam-occt');
 const session=createOcctSession({binary,timeoutMs:30000});
 try {
  await session.request({action:'open',projectId:p.id,operations:[{type:'$syncPlan',operations:features}],cursor:1});
  const meshes=[];
  for(const wall of p.walls){
   const mesh=await session.request({action:'mesh',id:wall.id,deflection:0.75});
   if(mesh.id!==wall.id||mesh.units!=='mm'||mesh.axes!=='z-up'||!Array.isArray(mesh.positions)||
    !Array.isArray(mesh.indices)||!(mesh.volume_mm3>0))throw new Error('cad_preview_mesh_unverified');
   meshes.push(mesh);
  }
  return {engine:'occt',verified:true,revision:p.version||1,unit:'mm',featureCount:features.length,meshes};
 }finally{session.close()}
}
