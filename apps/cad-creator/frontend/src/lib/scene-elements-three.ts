import * as THREE from 'three';
import type {CadSceneElement} from '@inneranimalmedia/agentsam-cad-shared';

export interface SceneBinding {element:CadSceneElement;roots:THREE.Object3D[];base:Map<THREE.Object3D,THREE.Matrix4>;center:THREE.Vector3;visibility:Map<THREE.Object3D,boolean>}
const tuple=(v:THREE.Vector3):[number,number,number]=>[v.x,v.y,v.z].map(n=>Math.round(n*1e6)/1e6) as [number,number,number];
const pathOf=(node:THREE.Object3D,root:THREE.Object3D):string=>{
  const parts:string[]=[];let current:THREE.Object3D|null=node;
  while(current&&current!==root){parts.unshift((current.name||current.type)+'['+(current.parent?.children.indexOf(current)||0)+']');current=current.parent;}
  return parts.join('/');
};
/** Bind every part of a semantic element; fallback paths are stable within the source asset hash. */
export function indexSceneElements(root:THREE.Object3D):Map<string,SceneBinding> {
  root.updateMatrixWorld(true);
  const groups=new Map<string,{node:THREE.Object3D;roots:Set<THREE.Object3D>}>();
  root.traverse(mesh=>{
    if(!(mesh instanceof THREE.Mesh))return;
    let semantic:THREE.Object3D|null=mesh;
    while(semantic!==root && semantic && !semantic.userData.DesignId)semantic=semantic.parent;
    if(!semantic||semantic===root)semantic=mesh;
    const id=String(semantic.userData.DesignId||'node:'+pathOf(semantic,root));
    mesh.userData.CadElementId=id;
    let group=groups.get(id);if(!group){group={node:semantic,roots:new Set()};groups.set(id,group);}
    group.roots.add(semantic);
  });
  const result=new Map<string,SceneBinding>();
  for(const [id,group] of groups){
    const roots=[...group.roots].filter(node=>{let p=node.parent;while(p&&p!==root){if(group.roots.has(p))return false;p=p.parent;}return true;});
    const box=new THREE.Box3();for(const node of roots)box.expandByObject(node);
    if(box.isEmpty())continue;
    const category=String(group.node.userData.Category||group.node.parent?.userData.Category||'component').toLowerCase();
    result.set(id,{roots,base:new Map(roots.map(node=>[node,node.matrixWorld.clone()])),
      center:box.getCenter(new THREE.Vector3()),visibility:new Map(roots.map(node=>[node,node.visible])),
      element:{id,name:group.node.name||id,category,source:String(group.node.userData.SourceAuthority||group.node.userData.Source||'Registered GLB'),
        bounds:{min:tuple(box.min),max:tuple(box.max)},offset:[0,0,0],rotation:0,visible:true}});
  }
  return result;
}
export function applySceneElementEdits(bindings:Map<string,SceneBinding>,edits:CadSceneElement[],roofVisible=true) {
  const saved=new Map(edits.map(element=>[element.id,element]));
  for(const [id,binding] of bindings){
    const element=saved.get(id)||binding.element,c=binding.center;
    const delta=new THREE.Matrix4().makeTranslation(c.x+element.offset[0],c.y+element.offset[1],c.z+element.offset[2])
      .multiply(new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(element.rotation)))
      .multiply(new THREE.Matrix4().makeTranslation(-c.x,-c.y,-c.z));
    for(const node of binding.roots){
      const world=delta.clone().multiply(binding.base.get(node)!);
      const local=node.parent?node.parent.matrixWorld.clone().invert().multiply(world):world;
      local.decompose(node.position,node.quaternion,node.scale);
      const roof=/roof|gable/.test(binding.element.category+' '+binding.element.name.toLowerCase());
      node.visible=(binding.visibility.get(node)??true)&&element.visible&&(!roof||roofVisible);
      node.updateMatrixWorld(true);
    }
  }
}
export function sceneElementBounds(binding:SceneBinding):THREE.Box3 {
  const box=new THREE.Box3();for(const node of binding.roots)box.expandByObject(node);return box;
}
