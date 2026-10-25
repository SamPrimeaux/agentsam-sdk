import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import type {CadSceneElement,CadSceneSource} from '@inneranimalmedia/agentsam-cad-shared';
import {createEmptyCadProject} from './create-empty-project';
import {reconcileSceneElements,patchSceneElement,sceneReviewContext} from './scene-document';
import {indexSceneElements,applySceneElementEdits,sceneElementBounds} from './scene-elements-three';
import {buildNativeSketchOperations} from './native-sketch';

const source:CadSceneSource={assetId:'model',contentHash:'a'.repeat(64),revision:'V1.5',units:'m',axes:'gltf-y-up'};
const element:CadSceneElement={id:'door',name:'Door',category:'door',source:'native BIM',bounds:{min:[0,0,0],max:[4,3,.2]},offset:[0,0,0],rotation:0,visible:true};
describe('one project scene document',()=>{
 it('retains saved edits on reopen, binds the exact source hash and rejects replacement geometry',()=>{
  const project=reconcileSceneElements(createEmptyCadProject(),source,[element]);
  const edited=patchSceneElement(project,'door',{offset:[2,0,0],color:'#123456',note:'Widen this opening'});
  expect(reconcileSceneElements(edited,source,[element])).toBe(edited);
  expect(()=>reconcileSceneElements(edited,{...source,contentHash:'b'.repeat(64)},[element])).toThrow('source changed');
  expect(sceneReviewContext(edited,'door').element?.note).toBe('Widen this opening');
 });
 it('updates every part of a shared DesignId in world metres and restores its original transform',()=>{
  const root=new THREE.Group();root.rotation.y=.4;
  for(const x of [0,4]){const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,3,.2));mesh.position.x=x;mesh.userData.DesignId='door';root.add(mesh);}
  const indexed=indexSceneElements(root),binding=indexed.get('door')!;
  expect(indexed.size).toBe(1);expect(binding.roots).toHaveLength(2);
  const before=sceneElementBounds(binding).getCenter(new THREE.Vector3());
  const edit={...binding.element,offset:[2,0,1] as [number,number,number],visible:false};
  applySceneElementEdits(indexed,[edit]);
  const after=sceneElementBounds(binding).getCenter(new THREE.Vector3());
  expect(after.x-before.x).toBeCloseTo(2);expect(after.z-before.z).toBeCloseTo(1);
  expect(binding.roots.every(node=>!node.visible)).toBe(true);
  applySceneElementEdits(indexed,[]);
  expect(sceneElementBounds(binding).getCenter(new THREE.Vector3()).distanceTo(before)).toBeLessThan(1e-8);
 });
 it('keeps unnamed meshes selectable with stable distinct source paths',()=>{
  const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry()),new THREE.Mesh(new THREE.BoxGeometry()));
  const first=[...indexSceneElements(root).keys()];expect(first).toHaveLength(2);expect(new Set(first).size).toBe(2);
  expect([...indexSceneElements(root).keys()]).toEqual(first);
 });
 it('review ink cannot accidentally create walls while explicit layout strokes still convert',()=>{
  const project=createEmptyCadProject();
  const result=buildNativeSketchOperations([
   {id:'mark',kind:'rect',points:[[0,0],[240,240]],purpose:'markup',targetId:'door'},
   {id:'layout',kind:'line',points:[[0,0],[144,0]],purpose:'layout'},
  ],project);
  expect(result.preview.rooms).toHaveLength(0);expect(result.preview.walls).toHaveLength(1);
  expect(result.preview.walls[0].sourceSketchShapeIds).toEqual(['layout']);
 });
});
