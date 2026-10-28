import {createOcctMeshGeometry} from '@inneranimalmedia/agentsam-3d-viewer/occt';
import * as THREE from 'three';
import type {ProjectState} from '@inneranimalmedia/agentsam-cad-shared';
import {projectSolidMeshes,type NativeMesh} from './native-engine';
export function nativeMeshGeometry(mesh:NativeMesh,planYSign:1|-1=-1):THREE.BufferGeometry{
  return createOcctMeshGeometry(mesh,{THREE},{planYSign}) as THREE.BufferGeometry;
}
export async function nativePlanLayer(project:ProjectState,material:(wall:ProjectState['walls'][number])=>THREE.Material,planYSign:1|-1=-1):Promise<THREE.Group>{
 const meshes=await projectSolidMeshes(project),layer=new THREE.Group();layer.name='OCCT solids';
 for(const result of meshes){const wall=project.walls.find(w=>w.id===result.id);if(!wall)throw new Error('native_wall_identity_mismatch');const node=new THREE.Mesh(nativeMeshGeometry(result,planYSign),material(wall));node.userData={DesignId:result.id,volume_mm3:result.volume_mm3,engine:'occt'};node.castShadow=true;node.receiveShadow=true;layer.add(node);}
 return layer;
}
export function disposeNativeLayer(layer:THREE.Group){layer.traverse(node=>{if(node instanceof THREE.Mesh)node.geometry.dispose();});}
