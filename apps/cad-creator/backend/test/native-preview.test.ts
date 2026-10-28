import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateNativePreview,validateNativePreviewProject} from '../src/cad/native-preview';

function sample(){
 return {id:'test-plan-native-preview',version:3,
  walls:[{id:'wall-001',x1:0,y1:0,x2:196.8503937,y2:0,thickness:7.874015748,height3D:118.1102362,material:'wood_panel'}],
  doors:[{id:'door-001',wallId:'wall-001',distanceAlongWall:.29,width:35.43307087,height:82.67716535}],
  windows:[]};
}
test('preview refuses invalid or malicious wall/opening inputs',()=>{
 const base=sample();
 assert.equal(validateNativePreviewProject(base).walls.length,1);
 assert.throws(()=>validateNativePreviewProject({...base,walls:[{...base.walls[0],id:'../unsafe'}]}),/wall_invalid/);
 assert.throws(()=>validateNativePreviewProject({...base,doors:[{...base.doors[0],distanceAlongWall:1}]}),/opening_outside_wall/);
 assert.throws(()=>validateNativePreviewProject({...base,walls:[{...base.walls[0],thickness:-1}]}),/wall_invalid/);
 assert.throws(()=>validateNativePreviewProject({...base,walls:new Array(121).fill(base.walls[0])}),/project_invalid/);
});
test('native C++ session tessellates a wall with an opening from current CAD plan',async()=>{
 const result=await evaluateNativePreview(sample());
 assert.equal(result.engine,'occt');assert.equal(result.verified,true);
 assert.equal(result.meshes.length,1);assert.equal(result.featureCount,2);
 assert.equal(result.meshes[0].id,'wall-001');
 assert.equal(result.meshes[0].units,'mm');assert.equal(result.meshes[0].axes,'z-up');
 assert.ok(result.meshes[0].indices.length>=36);
 assert.ok(Math.abs(result.meshes[0].volume_mm3-2622000000)<10);
});
