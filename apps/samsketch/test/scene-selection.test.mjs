import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { resolveSceneHit, exactSelectionRoot } from "../src/scene-selection.ts";

function factory(){
 const stage=new THREE.Group(),assembly=new THREE.Group();
 const left=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:"blue"}));
 const right=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:"red"}));
 left.position.x=-2;right.position.x=2;
 for(const [mesh,name] of [[left,"left-machine"],[right,"right-machine"]]){
  mesh.userData.itemId="assembly-one";
  mesh.userData.partId=name;
  assembly.add(mesh);
 }
 assembly.userData.itemId="assembly-one";stage.add(assembly);
 stage.updateMatrixWorld(true);
 return {stage,assembly,left,right};
}
test("raycast selects the hit source part, not the entire assembly",()=>{
 const {stage,assembly,left,right}=factory();
 const raycaster=new THREE.Raycaster(new THREE.Vector3(2,0,5),new THREE.Vector3(0,0,-1));
 const hit=resolveSceneHit(raycaster.intersectObjects(stage.children,true));
 assert.deepEqual(hit,{itemId:"assembly-one",partId:"right-machine"});
 assert.equal(exactSelectionRoot(assembly,hit.partId),right);
 assert.notEqual(exactSelectionRoot(assembly,hit.partId),left);
});
test("source-part selection does not modify sibling transforms",()=>{
 const {assembly,left,right}=factory();
 const rightTarget=exactSelectionRoot(assembly,"right-machine");
 const untouched=left.position.clone();
 rightTarget.position.x+=3;
 assert.deepEqual(left.position.toArray(),untouched.toArray());
 assert.equal(right.position.x,5);
});
test("empty ray hit does not retain the last assembly selection",()=>{
 const {stage}=factory();
 const raycaster=new THREE.Raycaster(new THREE.Vector3(0,2,5),new THREE.Vector3(0,0,-1));
 const picked=resolveSceneHit(raycaster.intersectObjects(stage.children,true));
 assert.equal(picked,null);
});
test("missing nested mesh does not silently broaden selection to its parent",()=>{
 const {assembly}=factory();
 assert.equal(exactSelectionRoot(assembly,"not-a-real-part"),null);
 assert.equal(exactSelectionRoot(assembly,null),assembly);
});
