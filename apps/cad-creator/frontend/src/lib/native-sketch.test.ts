import {describe,it,expect} from 'vitest';
import {createEmptyCadProject} from './create-empty-project';
import {buildNativeSketchOperations,importLegacySketch} from './native-sketch';

describe('SamSketch typed geometry conversion',()=>{
 it('converts a rectangle into a semantic space and four real CAD walls',()=>{
  const project=createEmptyCadProject();
  const result=buildNativeSketchOperations([{id:'roomA',kind:'rect',points:[[0,0],[240,180]]}],project);
  expect(result.preview.rooms).toHaveLength(1);
  expect(result.preview.rooms[0].areaSqFt).toBe(300);
  expect(result.preview.walls).toHaveLength(4);
  expect(result.operations.map(op=>op.type)).toEqual(['create_room','create_wall','create_wall','create_wall','create_wall']);
  expect(result.preview.walls.every(w=>w.sourceSketchShapeIds?.[0]==='roomA')).toBe(true);
 });
 it('does not generate zero-length or duplicate geometry',()=>{
  const project=createEmptyCadProject();
  const result=buildNativeSketchOperations([
   {id:'a',kind:'line',points:[[0,0],[144,0]]},
   {id:'b',kind:'line',points:[[144,0],[0,0]]},
   {id:'short',kind:'line',points:[[0,0],[1,0]]}
  ],project);
  expect(result.preview.walls).toHaveLength(1);
  expect(result.skipped).toBe(1);
  expect(result.warnings.some(w=>w.includes('shorter'))).toBe(true);
 });
 it('is idempotent against previously converted source strokes',()=>{
  const project=createEmptyCadProject();
  project.walls=[{id:'wallA',x1:0,y1:0,x2:144,y2:0,thickness:6,height3D:96,material:'drywall',sourceSketchShapeIds:['existing']}];
  const result=buildNativeSketchOperations([{id:'existing',kind:'line',points:[[0,0],[144,0]]}],project);
  expect(result.operations).toHaveLength(0);
 });
 it('rejects tiny room outlines without corrupting the project',()=>{
  const result=buildNativeSketchOperations([{id:'tiny',kind:'rect',points:[[0,0],[24,24]]}],createEmptyCadProject());
  expect(result.operations).toHaveLength(0);
  expect(result.warnings).toHaveLength(1);
 });
 it('imports supported legacy strokes while preserving unsupported source items',()=>{
  const source={document:{store:{
   'shape:one':{id:'shape:one',typeName:'shape',type:'geo',x:100,y:200,props:{geo:'rectangle',w:144,h:120}},
   'shape:two':{id:'shape:two',typeName:'shape',type:'draw',x:0,y:0,props:{segments:[]}}
  }}};
  const imported=importLegacySketch(source);
  expect(imported.strokes).toEqual([{id:'shape:one',kind:'rect',points:[[100,200],[244,320]]}]);
  expect(imported.unsupported).toBe(1);
 });
});
