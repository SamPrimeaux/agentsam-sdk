import type {ProjectState} from '@inneranimalmedia/agentsam-cad-shared';

/** Blank drawing, never a modified template or a fictitious scene fixture. */
export function createEmptyCadProject(): ProjectState {
 const now=Date.now();
 return {
  id: 'cad_'+(typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID():String(now)),
  name: 'Untitled CAD Project',
  units:'ft',scale:1,gridSize:12,snapToGrid:true,
  walls:[],doors:[],windows:[],rooms:[],furniture:[],annotations:[],parametricObjects:[],
  ceilingHeight:108,roofType:'none',
  lighting:{sunAltitude:45,sunAzimuth:135,intensity:1,timeOfDay:'noon',shadows:true,ambientColor:'#ffffff'},
  metadata:{createdAt:now,updatedAt:now,revision:0},updatedAt:now,version:1
 };
}
