import type {ProjectState,DesignOperation} from '@inneranimalmedia/agentsam-cad-shared';
import {applyDesignOperation} from '@inneranimalmedia/agentsam-cad-shared';

/** Canonical object-source editing contract shared by all CAD viewports and inspectors. */
export type Group='walls'|'doors'|'windows'|'rooms'|'furniture';
export const editable:Record<Group,string[]>={
 walls:['x1','y1','x2','y2','thickness','height3D','material','color','exterior','assembly'],
 doors:['wallId','distanceAlongWall','width','height','swing','openAngle'],
 windows:['wallId','distanceAlongWall','width','height','elevation'],
 rooms:['name','points','areaSqFt','floorMaterial','color'],
 furniture:['name','type','category','x','y','w','d','h','rotation','color']
};
const operations:Record<Group,[string,string]>={
 walls:['update_wall','wallId'],doors:['update_door','doorId'],windows:['update_window','windowId'],
 rooms:['update_room','roomId'],furniture:['update_fixture','fixtureId']
};
export function codeObjectFields(group:Group,object:Record<string,unknown>){
 return Object.fromEntries(editable[group].filter(key=>Object.prototype.hasOwnProperty.call(object,key)).map(key=>[key,object[key]]));
}
export function validatedObjectPatch(project:ProjectState,group:Group,id:string,source:string){
 const parsed:unknown=JSON.parse(source);
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Object definition must be a JSON object.');
 const update=parsed as Record<string,unknown>;
 const unknown=Object.keys(update).filter(key=>!editable[group].includes(key));
 if(unknown.length)throw new Error('These object properties are not editable: '+unknown.join(', '));
 if(Object.keys(update).length===0)throw new Error('At least one property is required.');
 const [type,idKey]=operations[group];
 const operation={type,[idKey]:id,updates:update,id:'cad-code-'+crypto.randomUUID(),timestamp:Date.now()} as unknown as DesignOperation;
 const result=applyDesignOperation(project,operation);
 if(!result.success)throw new Error(result.error||'Project rejected the parameter changes.');
 return result.project;
}
