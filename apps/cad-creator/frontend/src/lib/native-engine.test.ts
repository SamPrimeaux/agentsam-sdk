import {describe,it,expect} from 'vitest';
import {createEmptyCadProject} from './create-empty-project';
import {planFeatures,recordNativePlanChange,nativeHistory} from './native-engine';
import type {ProjectState} from '@inneranimalmedia/agentsam-cad-shared';
const project=():ProjectState=>({...createEmptyCadProject(),id:'canonical-project',walls:[{id:'wall-001',x1:0,y1:0,x2:200,y2:0,thickness:8,height3D:120,material:'concrete'}],doors:[{id:'door-001',wallId:'wall-001',distanceAlongWall:.5,width:36,height:84,swing:'left',openAngle:0}]});
describe('plan and native solid identity',()=>{
 it('converts centre-ratio openings and explicit inch coordinates to native millimetres',()=>{
  const ops=planFeatures(project());expect(ops[0]).toMatchObject({id:'wall-001',start:[0,0],end:[5080,0],thickness:203.2,height:3048});expect(ops[1]).toMatchObject({id:'door-001',host:'wall-001',width:914.4,height:2133.6});expect(ops[1].offset).toBeCloseTo(2082.8);
 });
 it('records edits on the same project and appends replay events without changing prior history',()=>{
  const before=project();const changed={...before,walls:before.walls.map(w=>({...w,height3D:130}))};const next=recordNativePlanChange(before,changed);expect(next.id).toBe(before.id);expect(nativeHistory(next).operations).toHaveLength(2);expect(nativeHistory(before).operations).toHaveLength(1);expect((nativeHistory(next).operations[1].operations as any[])[0].id).toBe('wall-001');expect(recordNativePlanChange(next,{...next,name:'renamed'}).nativeHistory).toBe(next.nativeHistory);
 });
});
