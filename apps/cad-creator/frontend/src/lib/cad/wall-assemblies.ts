import type {WallAssembly,WallElement,WallMaterial} from '@inneranimalmedia/agentsam-cad-shared';

export const WALL_MATERIALS:WallMaterial[]=['drywall','brick','concrete','glass','wood_panel','steel'];
const layer=(name:string,material:WallMaterial,thickness:number,id:string)=>({id,name,material,thickness});
export const WALL_ASSEMBLY_STARTERS:WallAssembly[]=[
 {name:'Wood stud · interior partition',layers:[
  layer('Interior gypsum','drywall',0.5,'gypsum-a'),
  layer('Stud cavity (nominal)','wood_panel',3.5,'framing'),
  layer('Exterior gypsum','drywall',0.5,'gypsum-b')
 ]},
 {name:'Insulated wood-framed exterior',layers:[
  layer('Interior gypsum','drywall',0.5,'finish-interior'),
  layer('Stud / insulation zone','wood_panel',5.5,'framing-insulation'),
  layer('Exterior sheathing','wood_panel',0.5,'sheathing'),
  layer('Exterior cladding','wood_panel',0.75,'cladding')
 ]},
 {name:'Concrete masonry shell',layers:[
  layer('Interior finish','drywall',0.5,'finish'),
  layer('Concrete structure','concrete',7.5,'concrete'),
  layer('Exterior finish','brick',3.5,'exterior')
 ]},
];
export function wallAssemblyTotal(assembly:WallAssembly):number {
 return Math.round(assembly.layers.reduce((sum,item)=>sum+item.thickness,0)*1000)/1000;
}
export function validateWallAssembly(assembly:WallAssembly):string|null {
 if(!assembly.name.trim()||!assembly.layers.length)return 'An assembly needs a name and at least one layer.';
 if(assembly.layers.length>20)return 'Limit assemblies to 20 layers.';
 if(assembly.layers.some(item=>!item.id||!item.name.trim()||!WALL_MATERIALS.includes(item.material)||!Number.isFinite(item.thickness)||item.thickness<=0))
  return 'Every layer needs a material and a positive thickness.';
 if(wallAssemblyTotal(assembly)>120)return 'Total wall thickness must not exceed 120 inches.';
 return null;
}
export function defaultWallAssembly(wall:WallElement):WallAssembly {
 return wall.assembly||{name:'Existing single-layer wall',layers:[layer('Wall body',wall.material,wall.thickness,'wall-body')]};
}
export function cloneAssembly(template:WallAssembly):WallAssembly {
 return {name:template.name,layers:template.layers.map((item,index)=>({...item,id:'layer-'+Date.now()+'-'+index}))};
}
