import * as THREE from "three";

/**
 * Resolve the frontmost raycast object to an exact editable scene instance.
 * Source-part identity is optional; selecting an assembly is a separate action.
 * Never infer the entire assembly bounds from a hit on one nested mesh.
 */
export function resolveSceneHit(hits:readonly THREE.Intersection[]):{itemId:string;partId:string|null}|null{
 for(const hit of hits){
  const itemId=hit.object.userData.itemId;
  if(typeof itemId!=="string"||!itemId)return null;
  const partId=hit.object.userData.partId;
  return {itemId,partId:typeof partId==="string"&&partId?partId:null};
 }
 return null;
}

export function exactSelectionRoot(root:THREE.Object3D|null,partId:string|null):THREE.Object3D|null{
 if(!root||!partId)return root;
 let matched:THREE.Object3D|null=null;
 root.traverse(node=>{
  if(!matched && node instanceof THREE.Mesh && node.userData.partId===partId)matched=node;
 });
 return matched;
}
