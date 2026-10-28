import {describe,it,expect} from 'vitest';
import {createEmptyCadProject} from '../create-empty-project';
import {applyDesignOperation} from '@inneranimalmedia/agentsam-cad-shared';
import {cloneAssembly,WALL_ASSEMBLY_STARTERS,wallAssemblyTotal,validateWallAssembly} from './wall-assemblies';

describe('BIM wall assembly editing',()=>{
 it('preserves layered construction and updates total modeled wall thickness',()=>{
  const base=createEmptyCadProject();
  base.walls=[{id:'wall-a',x1:0,y1:0,x2:240,y2:0,thickness:6,height3D:108,material:'wood_panel'}];
  const assembly=cloneAssembly(WALL_ASSEMBLY_STARTERS[1]);
  expect(validateWallAssembly(assembly)).toBeNull();
  const result=applyDesignOperation(base,{
   id:'test-assembly',timestamp:1,type:'update_wall',wallId:'wall-a',
   updates:{assembly,thickness:wallAssemblyTotal(assembly),material:assembly.layers[0].material}
  });
  expect(result.success).toBe(true);
  const wall=result.project.walls[0];
  expect(wall.assembly?.layers).toHaveLength(4);
  expect(wall.thickness).toBe(7.25);
  expect(wall.assembly?.layers[2].name).toBe('Exterior sheathing');
  expect(base.walls[0].assembly).toBeUndefined();
 });
 it('rejects invalid or inconsistent assembly data at project boundary',()=>{
  const base=createEmptyCadProject();
  base.walls=[{id:'wall-b',x1:0,y1:0,x2:60,y2:0,thickness:4,height3D:108,material:'wood_panel'}];
  const assembly=cloneAssembly(WALL_ASSEMBLY_STARTERS[0]);
  expect(validateWallAssembly({...assembly,layers:[{...assembly.layers[0],thickness:-5}]})).not.toBeNull();
  const invalid=applyDesignOperation(base,{
   id:'test-inconsistent',timestamp:2,type:'update_wall',wallId:'wall-b',
   updates:{assembly,thickness:4}
  });
  expect(invalid.success).toBe(false);
  expect(invalid.error).toMatch(/invalid_wall_assembly/);
 });
});
