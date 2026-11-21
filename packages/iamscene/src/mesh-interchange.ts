/**
 * Verified triangle-mesh import for STL, OBJ and PLY. Produces real renderable
 * GLBs, separately addressable IAMGeometry manifests and editable IAMScene nodes.
 * Sources remain linked and unmodified. No claim of parametric reconstruction.
 */
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { createSceneDocument } from './document.js';
import { serializeIAMGeometry, IAMGEOMETRY_MEDIA_TYPE, type GeometryFormat, type IAMGeometryDocument } from './geometry.js';
import { encodeGltfAsset } from './gltf.js';
import type { FormatImport, FormatImportOptions } from './format-registry.js';

const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const toMeters: Record<NonNullable<FormatImportOptions['sourceUnits']>, number> = {
  m: 1, cm: 0.01, mm: 0.001, in: 0.0254, ft: 0.3048,
};
function safeName(name: string): string { return name.replace(/[^a-zA-Z0-9_.-]+/g,'-').slice(0, 70) || 'mesh'; }
function unitFactor(options: FormatImportOptions): number {
  if (!options.sourceUnits || !Object.hasOwn(toMeters,options.sourceUnits)) throw new Error('iamscene_mesh_source_units_required');
  return toMeters[options.sourceUnits];
}
function decodeMeshes(format: 'obj'|'stl'|'ply', raw: Uint8Array): THREE.Object3D[] {
  const buffer = Uint8Array.from(raw).buffer;
  if (format === 'stl') {
    const geometry = new STLLoader().parse(buffer);
    return [new THREE.Mesh(geometry)];
  }
  if (format === 'ply') {
    const geometry = new PLYLoader().parse(buffer);
    // PLY can contain point clouds. Do not reinterpret points as faces.
    if (!geometry.index || geometry.index.count < 3 || geometry.index.count % 3 !== 0)
      throw new Error('iamscene_ply_faces_required');
    return [new THREE.Mesh(geometry)];
  }
  const group = new OBJLoader().parse(decoder.decode(raw));
  const meshes: THREE.Object3D[] = [];
  group.traverse(object=>{ if ((object as THREE.Mesh).isMesh) meshes.push(object); });
  group.updateMatrixWorld(true);
  return meshes;
}
function normalizedGeometry(object: THREE.Object3D, scale: number): THREE.BufferGeometry {
  const source = (object as THREE.Mesh).geometry;
  if (!source?.isBufferGeometry) throw new Error('iamscene_mesh_invalid_geometry');
  const geometry = source.clone();
  geometry.applyMatrix4(object.matrixWorld);
  geometry.scale(scale,scale,scale);
  const unindexed = geometry.index ? geometry.toNonIndexed() : geometry;
  if (unindexed !== geometry) geometry.dispose();
  const positions = unindexed.getAttribute('position');
  if (!positions || positions.itemSize !== 3 || positions.count < 3 || positions.count % 3 !== 0 || positions.count > 3000000)
    throw new Error('iamscene_mesh_invalid_triangle_count');
  for (let i=0;i<positions.count*3;i++) if (!Number.isFinite(positions.array[i])) throw new Error('iamscene_mesh_nonfinite_position');
  if (!unindexed.getAttribute('normal')) unindexed.computeVertexNormals();
  return unindexed;
}
async function encodeMeshGLB(geometry: THREE.BufferGeometry, name: string): Promise<Uint8Array> {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  if (!normals || normals.count !== positions.count) throw new Error('iamscene_mesh_normals_invalid');
  const count = positions.count;
  const data = new Uint8Array(count * 3 * 4 * 2);
  const view = new DataView(data.buffer);
  let min: [number,number,number] = [Infinity,Infinity,Infinity];
  let max: [number,number,number] = [-Infinity,-Infinity,-Infinity];
  for (let i=0;i<count;i++) for(let j=0;j<3;j++) {
    const v=positions.getComponent(i,j);
    view.setFloat32((i*3+j)*4,v,true);
    min[j]=Math.min(min[j],v); max[j]=Math.max(max[j],v);
    const n=normals.getComponent(i,j);
    if (!Number.isFinite(n)) throw new Error('iamscene_mesh_nonfinite_normal');
    view.setFloat32((count*3+i*3+j)*4,n,true);
  }
  const block=count*3*4;
  const gltf={ asset:{version:'2.0',generator:'@inneranimalmedia/iamscene mesh-import'},
    scene:0,scenes:[{nodes:[0]}],nodes:[{name,mesh:0}],meshes:[{name,primitives:[{attributes:{POSITION:0,NORMAL:1},mode:4}]}],
    buffers:[{byteLength:data.length}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:block,target:34962},{buffer:0,byteOffset:block,byteLength:block,target:34962}],
    accessors:[{bufferView:0,componentType:5126,count,type:'VEC3',min,max},{bufferView:1,componentType:5126,count,type:'VEC3'}] };
  return await encodeGltfAsset({json:gltf,bin:data,format:'glb'},{format:'glb'}) as Uint8Array;
}
export async function importTriangleMesh(format: 'obj'|'stl'|'ply', raw: Uint8Array, options: FormatImportOptions): Promise<FormatImport> {
  if (!options.id || !options.assetUri) throw new Error('iamscene_mesh_id_and_source_required');
  const scale=unitFactor(options);
  const meshes=decodeMeshes(format,raw);
  if (!meshes.length || meshes.length > 512) throw new Error('iamscene_mesh_count_invalid');
  const document=createSceneDocument({id:safeName(options.id),name:options.name || options.id,
    metadata:{provenance:{sourceFormat:format,sourceAsset:options.assetUri,sourceUnits:options.sourceUnits,importMode:'triangle-mesh'}}});
  const generated: NonNullable<FormatImport['generatedFiles']> = [];
  const basename=safeName(options.id);
  const warnings=['Mesh triangles and available normals converted to GLB; parametric features and original source material semantics are not reconstructed.'];
  if (format==='obj') warnings.push('OBJ material-library (.mtl) and external textures are retained only in the original linked source and need a dedicated sidecar resolver.');
  if (format==='stl') warnings.push('STL has no standard unit or material semantics; sourceUnits was explicitly required.');
  for (let i=0;i<meshes.length;i++) {
    const name=meshes[i].name || `${format.toUpperCase()} mesh ${i+1}`;
    const geometry=normalizedGeometry(meshes[i],scale);
    const glb=await encodeMeshGLB(geometry,name);
    geometry.dispose();
    const stem=`${basename}-${String(i+1).padStart(3,'0')}`;
    const glbUri=`./${stem}.glb`, geometryUri=`./${stem}.iamgeometry`;
    const manifest: IAMGeometryDocument={format:'iamgeometry',formatVersion:'1.0.0',id:stem,name,
      units:options.sourceUnits!,defaultRenderId:'preview',
      representations:[{id:'preview',role:'render',format:'glb',uri:glbUri,units:'m',mediaType:'model/gltf-binary'},
        {id:'original',role:'source',format:format as GeometryFormat,uri:options.assetUri}],
      source:{schema:`interchange:${format}`,uri:options.assetUri,elementId:name},
      metadata:{sourceUnits:options.sourceUnits,sourceFormat:format},
    };
    const nodeId=`mesh-${i+1}`;
    document.assets.push({id:`geom-${i+1}`,uri:geometryUri,mediaType:IAMGEOMETRY_MEDIA_TYPE,role:'presentation',units:'m'});
    document.scene.nodes.push({id:nodeId,name,kind:'mesh',parentId:'scene-root',transform:{position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},visible:true,assetRef:`geom-${i+1}`});
    generated.push({uri:glbUri,bytes:glb,mediaType:'model/gltf-binary'},
      {uri:geometryUri,bytes:encoder.encode(serializeIAMGeometry(manifest)),mediaType:IAMGEOMETRY_MEDIA_TYPE});
  }
  document.assets.push({id:'original-source',uri:options.assetUri,mediaType:'application/octet-stream',role:'geometry-source'});
  return {format,document:{kind:'scene',value:document},source:raw,generatedFiles:generated,warnings};
}
