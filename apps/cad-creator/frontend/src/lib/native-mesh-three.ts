import * as THREE from 'three';
import type {ProjectState} from '@inneranimalmedia/agentsam-cad-shared';
import {projectSolidMeshes,type NativeMesh} from './native-engine';
export function nativeMeshGeometry(mesh:NativeMesh,planYSign:1|-1=-1):THREE.BufferGeometry{
 if(mesh.units!=='mm'||mesh.axes!=='z-up')throw new Error('native_mesh_coordinate_contract_invalid');
 const positions=new Float32Array(mesh.positions.length),normals=new Float32Array(mesh.normals.length),indices=[...mesh.indices];
 for(let k=0;k<positions.length;k+=3){positions[k]=mesh.positions[k]*.001;positions[k+1]=mesh.positions[k+2]*.001;positions[k+2]=mesh.positions[k+1]*.001*planYSign;normals[k]=mesh.normals[k];normals[k+1]=mesh.normals[k+2];normals[k+2]=mesh.normals[k+1]*planYSign;}
 if(planYSign===1)for(let k=0;k<indices.length;k+=3)[indices[k+1],indices[k+2]]=[indices[k+2],indices[k+1]];
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.setIndex(indices);geometry.computeBoundingSphere();return geometry;
}
export async function nativePlanLayer(project:ProjectState,material:(wall:ProjectState['walls'][number])=>THREE.Material,planYSign:1|-1=-1):Promise<THREE.Group>{
 const meshes=await projectSolidMeshes(project),layer=new THREE.Group();layer.name='OCCT solids';
 for(const result of meshes){const wall=project.walls.find(w=>w.id===result.id);if(!wall)throw new Error('native_wall_identity_mismatch');const node=new THREE.Mesh(nativeMeshGeometry(result,planYSign),material(wall));node.userData={DesignId:result.id,volume_mm3:result.volume_mm3,engine:'occt'};node.castShadow=true;node.receiveShadow=true;layer.add(node);}
 return layer;
}
export function disposeNativeLayer(layer:THREE.Group){layer.traverse(node=>{if(node instanceof THREE.Mesh)node.geometry.dispose();});}
