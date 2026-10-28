import {describe,it,expect} from 'vitest';
import {measuredTakeoff} from './project-takeoff';
import {createEmptyCadProject} from '../create-empty-project';
describe('measured BIM takeoff',()=>{
 it('derives length, wall area and openings from authoritative geometry, without invented prices',()=>{
  const project=createEmptyCadProject(); project.walls=[{id:'w1',x1:0,y1:0,x2:120,y2:0,thickness:6,height3D:96,material:'wood_panel'}];
  project.doors=[{id:'d1',wallId:'w1',width:36,height:72,distanceAlongWall:.5,swing:'left',openAngle:0}];
  const q=measuredTakeoff(project);
  expect(q.lengthFt).toBe(10);expect(q.wallGrossFt2).toBe(80);expect(q.openingFt2).toBe(18);expect(q.wallNetFt2).toBe(62);
  expect(q).not.toHaveProperty('estCost');
 });
});
