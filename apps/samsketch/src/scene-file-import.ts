/** Browser-side multi-model intake for account-owned SamSketch IAMScene documents.
 * Models are converted only when necessary; the original source files remain
 * separately referenced as immutable assets. No model bytes live in scene JSON.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { encodeGltfAsset, importGltfScene, parseGltfAsset } from '../../../packages/iamscene/src/gltf';
import { assertValidSceneDocument } from '../../../packages/iamscene/src/validate';
import type { SceneAsset, SceneDocument, SceneMaterial, SceneNode } from '../../../packages/iamscene/src/types';

const MODEL_EXTENSIONS = new Set(['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', 'dae']);
const SOURCE_MIME: Record<string, string> = {
  gltf: 'model/gltf+json', obj: 'model/obj', stl: 'model/stl',
  ply: 'model/ply', fbx: 'model/fbx', dae: 'model/vnd.collada+xml',
  bin: 'application/octet-stream', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  mtl: 'text/plain',
};
const LIMIT_BYTES = 25_000_000;
const extOf = (name: string) => name.split('.').pop()?.toLowerCase() || '';
const cleanName = (name: string) => name.replace(/^[\s.]+/, '').slice(0, 120);
const newAssetId = () => 'model_' + crypto.randomUUID().replaceAll('-', '');
const toHex = (binary: ArrayBuffer) => [...new Uint8Array(binary)].map(n => n.toString(16).padStart(2, '0')).join('');
async function sha256(bytes: Uint8Array): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
}
export const MODEL_IMPORT_ACCEPT = '.glb,.gltf,.obj,.stl,.ply,.fbx,.dae,.bin,.png,.jpg,.jpeg,.webp,.mtl';
export interface SceneAssetUpload { asset: SceneAsset; bytes: Uint8Array }
export interface ModelImport {
  title: string;
  format: string;
  uploads: SceneAssetUpload[];
  nodes: SceneNode[];
  materials: SceneMaterial[];
  rootId: string;
}
export function isModelFile(file: File): boolean { return MODEL_EXTENSIONS.has(extOf(file.name)); }

async function convertToGlb(file: File, batch: File[]): Promise<Uint8Array> {
  const ext = extOf(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (ext === 'glb') {
    const parsed = parseGltfAsset(bytes);
    if (parsed.format !== 'glb') throw new Error('The selected .glb is not a binary glTF file.');
    return bytes;
  }
  if (ext === 'gltf') {
    const parsed = parseGltfAsset(bytes);
    if (parsed.format !== 'gltf') throw new Error('The selected .gltf is not a glTF JSON file.');
    const encoded = await encodeGltfAsset(parsed, {
      format: 'glb',
      resolveUri: async uri => {
        const normalized = decodeURIComponent(uri.split(/[?#]/)[0]).replace(/\\/g, '/');
        if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..') || /^[a-z]+:/i.test(normalized)) {
          throw new Error('External or unsafe glTF resource paths are not supported: ' + uri);
        }
        const sidecar = batch.find(candidate => candidate.name === normalized || candidate.name === normalized.split('/').pop() || candidate.webkitRelativePath?.endsWith('/' + normalized));
        if (!sidecar) throw new Error('Missing glTF resource "' + normalized + '". Select the .gltf with its .bin and texture files.');
        return new Uint8Array(await sidecar.arrayBuffer());
      },
    });
    if (!(encoded instanceof Uint8Array)) throw new Error('glTF conversion did not produce a GLB.');
    return encoded;
  }
  let root: THREE.Object3D;
  let animations: THREE.AnimationClip[] = [];
  if (ext === 'obj') {
    root = new OBJLoader().parse(await file.text());
  } else if (ext === 'stl') {
    const geometry = new STLLoader().parse(bytes.buffer as ArrayBuffer);
    root = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#cbd5e1' }));
  } else if (ext === 'ply') {
    const geometry = new PLYLoader().parse(bytes.buffer as ArrayBuffer);
    const hasColors = Boolean(geometry.getAttribute('color'));
    root = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: hasColors }));
  } else if (ext === 'fbx') {
    root = new FBXLoader().parse(bytes.buffer as ArrayBuffer, '');
    animations = (root as THREE.Group).animations || [];
  } else if (ext === 'dae') {
    const result = new ColladaLoader().parse(await file.text(), '');
    root = result.scene;
    animations = result.animations || [];
  } else {
    throw new Error('Unsupported 3D model format: ' + file.name);
  }
  root.name ||= file.name.replace(/\.[^.]+$/, '');
  root.updateMatrixWorld(true);
  const glb = await new GLTFExporter().parseAsync(root, { binary: true, animations });
  if (!(glb instanceof ArrayBuffer)) throw new Error('Model conversion failed to produce a binary GLB.');
  const output = new Uint8Array(glb);
  // Never claim converted animation is retained unless glTF contains the clips.
  if (animations.length && (parseGltfAsset(output).json.animations?.length || 0) < animations.length) {
    throw new Error('Model animation could not be preserved while converting ' + file.name + '. Export it as GLB first.');
  }
  return output;
}

function remapModel(source: SceneDocument, id: string) {
  const idOf = (nodeId: string) => id + '_' + nodeId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const matOf = (matId: string) => id + '_' + matId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const sourceAsset = source.assets.find(asset => asset.id === 'gltf-source');
  if (!sourceAsset) throw new Error('Missing model source after glTF import.');
  const nodes = source.scene.nodes.map(node => {
    const meta = node.userData?.iamGltf as Record<string, unknown> | undefined;
    return {
      ...node, id: idOf(node.id),
      ...(node.parentId ? { parentId: idOf(node.parentId) } : { parentId: 'scene-root' }),
      ...(node.assetRef ? { assetRef: id } : {}),
      ...(node.materialRef ? { materialRef: matOf(node.materialRef) } : {}),
      userData: {
        ...node.userData,
        ...(meta ? { iamGltf: { ...meta, assetId: id } } : {}),
      },
    } as SceneNode;
  });
  return { nodes, materials: source.materials.map(material => ({ ...material, id: matOf(material.id) })), rootId: idOf('scene-root') };
}

export async function prepareModelImports(files: File[], onProgress?: (status: string) => void): Promise<ModelImport[]> {
  const models = files.filter(isModelFile);
  if (!models.length) throw new Error('Select a 3D model (.glb, .gltf, .obj, .stl, .ply, .fbx or .dae).');
  if (models.length > 24) throw new Error('Import up to 24 models per batch.');
  const results: ModelImport[] = [];
  for (let i = 0; i < models.length; i++) {
    const file = models[i];
    if (!file.size || file.size > LIMIT_BYTES) throw new Error(file.name + ' exceeds the supported 25 MB source-file limit.');
    onProgress?.('Importing ' + (i + 1) + '/' + models.length + ': ' + file.name);
    const id = newAssetId();
    const glb = await convertToGlb(file, files);
    if (glb.length > LIMIT_BYTES) throw new Error(file.name + ' exceeds the supported 25 MB converted-model limit.');
    const digest = await sha256(glb);
    const asset: SceneAsset = {
      id, uri: 'assets/' + id + '.glb',
      mediaType: 'model/gltf-binary', role: 'presentation', sha256: digest, units: 'm',
    };
    const parsed = importGltfScene(glb, { id, name: cleanName(file.name), assetUri: asset.uri });
    if (!parsed.scene.nodes.some(node => node.kind === 'mesh')) throw new Error(file.name + ' contains no mesh geometry.');
    const geometry = remapModel(parsed, id);
    const uploads: SceneAssetUpload[] = [{ asset, bytes: glb }];
    const sourceExt = extOf(file.name);
    // Keep original non-GLB sources in the account's R2 scene assets as well.
    if (sourceExt !== 'glb') {
      const raw = new Uint8Array(await file.arrayBuffer());
      const sid = newAssetId();
      uploads.push({ asset: {
        id: sid, uri: 'assets/' + sid + '.' + sourceExt,
        mediaType: SOURCE_MIME[sourceExt], role: 'geometry-source',
        sha256: await sha256(raw),
      }, bytes: raw });
    }
    // Retain companion resources once per batch, even after embedding them into
    // the presentation GLB. Users can download the original authoring source.
    if (i===0) {
      const companions=files.filter(candidate=>!isModelFile(candidate)&&SOURCE_MIME[extOf(candidate.name)]);
      if (companions.length+uploads.length+models.length*2>100) throw new Error('Too many source/companion files for one scene.');
      for (const companion of companions) {
        if (!companion.size || companion.size > LIMIT_BYTES) throw new Error(companion.name+' exceeds the supported 25 MB source limit.');
        const raw=new Uint8Array(await companion.arrayBuffer());
        const cid=newAssetId();
        const cext=extOf(companion.name);
        uploads.push({asset:{
          id:cid,uri:'assets/'+cid+'.'+cext,mediaType:SOURCE_MIME[cext],
          role:'reference',sha256:await sha256(raw),
        },bytes:raw});
      }
    }
    results.push({
      title: cleanName(file.name), format: sourceExt, uploads,
      nodes: geometry.nodes, materials: geometry.materials, rootId: geometry.rootId,
    });
  }
  return results;
}

export function appendModelImports(document: SceneDocument, imports: ModelImport[]): SceneDocument {
  const next = structuredClone(document);
  const provenance = Array.isArray(next.metadata.provenance?.modelImports)
    ? [...(next.metadata.provenance.modelImports as unknown[])]
    : [];
  for (const entry of imports) {
    if (next.assets.length + entry.uploads.length > 100) throw new Error('Scene asset limit reached (100).');
    if (next.scene.nodes.length + entry.nodes.length > 5000) throw new Error('Scene node limit reached (5000).');
    next.assets.push(...entry.uploads.map(upload => upload.asset));
    next.materials.push(...entry.materials);
    next.scene.nodes.push(...entry.nodes);
    provenance.push({
      name: entry.title, sourceFormat: entry.format,
      presentationAssetId: entry.uploads[0].asset.id,
      sourceAssetId: entry.uploads[1]?.asset.id || entry.uploads[0].asset.id,
    });
  }
  next.metadata.provenance = { ...next.metadata.provenance, modelImports: provenance };
  next.metadata.modifiedAt = new Date().toISOString();
  assertValidSceneDocument(next);
  return next;
}
