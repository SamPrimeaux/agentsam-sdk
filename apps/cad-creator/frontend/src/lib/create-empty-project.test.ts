import {describe,expect,it} from 'vitest';
import {applyDesignOperation,validateDesignOperation} from '@inneranimalmedia/agentsam-cad-shared';
import {createEmptyCadProject} from './create-empty-project';

describe('CAD Creator real authoring contracts',()=>{
 it('starts an independent empty document with no forced example geometry',()=>{
  const a=createEmptyCadProject(),b=createEmptyCadProject();
  expect(a.id).not.toBe(b.id);
  expect(a.walls).toEqual([]);
  expect(a.rooms).toEqual([]);
  expect(a.windows).toEqual([]);
  expect(a.doors).toEqual([]);
  expect(a.furniture).toEqual([]);
  expect(a.parametricObjects).toEqual([]);
 });
 it('creates and edits a real wall through the canonical operation contract',()=>{
  const blank=createEmptyCadProject();
  const create=applyDesignOperation(blank,{type:'create_wall',id:'op-1',timestamp:1,
    wall:{id:'wall-1',x1:0,y1:0,x2:144,y2:0,thickness:6,height3D:108,material:'drywall'}});
  expect(create.success,create.error).toBe(true);
  expect(create.project.walls).toHaveLength(1);
  const edit=applyDesignOperation(create.project,{type:'update_wall',id:'op-2',timestamp:2,
    wallId:'wall-1',updates:{thickness:8,material:'brick'}});
  expect(edit.success,edit.error).toBe(true);
  expect(edit.project.walls[0].thickness).toBe(8);
  expect(edit.project.walls[0].material).toBe('brick');
  expect(edit.project.version).toBeGreaterThan(create.project.version);
  expect(blank.walls).toHaveLength(0);
 });
 it('rejects geometrically invalid openings instead of accepting decorative edits',()=>{
  const blank=createEmptyCadProject();
  const result=applyDesignOperation(blank,{type:'add_door',id:'op-3',timestamp:3,
    door:{id:'door-1',wallId:'missing-wall',distanceAlongWall:.5,width:36,height:84,swing:'left',openAngle:0}});
  expect(result.success).toBe(false);
  expect(result.project).toEqual(blank);
  expect(result.error).toMatch(/opening_wall_missing/);
 });
});
