import type {ProjectState} from '@inneranimalmedia/agentsam-cad-shared';

/** Measured quantities only. Pricing needs explicit unit rates and an approved scope. */
export function measuredTakeoff(project:ProjectState) {
 const lengthIn=project.walls.reduce((sum,w)=>sum+Math.hypot(w.x2-w.x1,w.y2-w.y1),0);
 const wallGrossFt2=project.walls.reduce((sum,w)=>sum+(Math.hypot(w.x2-w.x1,w.y2-w.y1)*w.height3D/144),0);
 const openingFt2=[...project.doors,...project.windows].reduce((sum,o)=>sum+o.width*o.height/144,0);
 const floorFt2=project.rooms.reduce((sum,room)=>{
  const pts=room.points;
  if(pts.length<3)return sum;
  let cross=0;
  for(let i=0;i<pts.length;i++){const next=pts[(i+1)%pts.length];cross+=pts[i][0]*next[1]-next[0]*pts[i][1];}
  return sum+Math.abs(cross)/288;
 },0);
 const assemblies=new Map<string,{count:number;lengthFt:number}>();
 project.walls.forEach(w=>{
  const name=w.assembly?.name||'Unspecified / single wall body',entry=assemblies.get(name)||{count:0,lengthFt:0};
  entry.count++;entry.lengthFt+=Math.hypot(w.x2-w.x1,w.y2-w.y1)/12;assemblies.set(name,entry);
 });
 return {floorFt2,lengthFt:lengthIn/12,wallGrossFt2,openingFt2,wallNetFt2:Math.max(0,wallGrossFt2-openingFt2),
  walls:project.walls.length,doors:project.doors.length,windows:project.windows.length,assemblies:[...assemblies].map(([name,counts])=>({name,...counts}))};
}
