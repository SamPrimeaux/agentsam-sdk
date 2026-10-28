import {describe,it,expect} from 'vitest';
import {codeObjectFields,validatedObjectPatch} from './CadCodeWorkspace';
import {createEmptyCadProject} from '../lib/create-empty-project';
describe('CAD GUI/code parity',()=>{
 it('exposes mutable BIM fields without exposing immutable object identity',()=>{
  const object={id:'wall-1',x1:0,y1:0,x2:120,y2:0,thickness:6,height3D:96,material:'wood_panel'};
  const fields=codeObjectFields('walls',object);
  expect(fields).not.toHaveProperty('id');expect(fields).toHaveProperty('thickness',6);
 });
 it('applies valid source edits through the shared CAD operation and rejects identity manipulation',()=>{
  const project=createEmptyCadProject();
  project.walls=[{id:'wall-1',x1:0,y1:0,x2:120,y2:0,thickness:6,height3D:96,material:'wood_panel'}];
  const updated=validatedObjectPatch(project,'walls','wall-1',JSON.stringify({x2:144,thickness:5.5}));
  expect(updated.walls[0].x2).toBe(144);
  expect(updated.walls[0].thickness).toBe(5.5);
  expect(project.walls[0].x2).toBe(120);
  expect(()=>validatedObjectPatch(project,'walls','wall-1','{"id":"unexpected"}')).toThrow(/not editable/);
  expect(()=>validatedObjectPatch(project,'walls','wall-1','{"thickness":-10}')).toThrow();
  expect(()=>validatedObjectPatch(project,'walls','wall-1','{')).toThrow();
 });
});
