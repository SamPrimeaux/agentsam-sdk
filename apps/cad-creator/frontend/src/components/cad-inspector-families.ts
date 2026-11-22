import {Activity, Aperture, Box, BrickWall, Camera, Clapperboard, File, Layers3, Mountain, ScanLine, SlidersHorizontal, Sun, SwatchBook, Workflow} from 'lucide-react';

export const cadInspectorFamilies = [
  {id:'object', label:'Object & Transform', group:'Selection', icon:SlidersHorizontal},
  {id:'geometry', label:'Geometry', group:'Selection', icon:Box},
  {id:'bim', label:'BIM & Engineering', group:'Selection', icon:BrickWall},
  {id:'materials', label:'Materials', group:'Selection', icon:SwatchBook},
  {id:'camera', label:'Camera', group:'Scene', icon:Camera},
  {id:'environment', label:'Environment', group:'Scene', icon:Layers3},
  {id:'lighting', label:'Lighting', group:'Scene', icon:Sun},
  {id:'terrain', label:'Terrain & Site', group:'Scene', icon:Mountain},
  {id:'rendering', label:'Rendering', group:'Scene', icon:Aperture},
  {id:'motion', label:'Motion & Presentation', group:'Scene', icon:Clapperboard},
  {id:'analysis', label:'Analysis', group:'Engineering', icon:ScanLine},
  {id:'simulation', label:'Simulation', group:'Engineering', icon:Activity},
  {id:'project', label:'Project', group:'Document', icon:File},
  {id:'source', label:'Source', group:'Document', icon:Workflow},
] as const;
export type CadInspectorFamily = typeof cadInspectorFamilies[number]['id'];
