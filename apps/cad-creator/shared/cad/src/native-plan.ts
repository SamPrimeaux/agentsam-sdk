import type {ProjectState} from './types';
export type NativeOperation=Record<string,unknown>;
export type NativeHistory={version:1;operations:NativeOperation[];cursor:number};
/** The plan is inches; OCCT receives millimetres, Z-up. Opening positions are
 * centre ratios, matching SamSketch, and are converted to left-edge distances. */
export function planFeatures(project:ProjectState):NativeOperation[]{
 const ops:NativeOperation[]=[];
 for(const wall of project.walls){const length=Math.hypot(wall.x2-wall.x1,wall.y2-wall.y1);
  ops.push({id:wall.id,type:'wall',start:[wall.x1*25.4,wall.y1*25.4],end:[wall.x2*25.4,wall.y2*25.4],thickness:wall.thickness*25.4,height:wall.height3D*25.4});
  for(const opening of [...project.doors,...project.windows].filter(o=>o.wallId===wall.id)){
   ops.push({id:opening.id,type:'opening',host:wall.id,offset:(opening.distanceAlongWall*length-opening.width/2)*25.4,width:opening.width*25.4,height:opening.height*25.4,sill:('elevation'in opening?opening.elevation:0)*25.4});
  }
 }
 return ops;
}
export function nativeHistory(project:ProjectState):NativeHistory{return project.nativeHistory||{version:1,operations:[{type:'$syncPlan',operations:planFeatures(project)}],cursor:1};}
