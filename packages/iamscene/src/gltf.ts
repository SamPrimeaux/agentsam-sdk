/**
 * Khronos glTF 2.0 interchange for the canonical editable .iamscene document.
 *
 * Import preserves the original glTF/GLB as a geometry-source asset; editable
 * nodes/materials reference original glTF indices. Export patches the original
 * asset (mesh/accessor/buffer/texture/skin/animation/extension payloads remain
 * intact) instead of round-tripping vertices through a lossy text projection.
 *
 * Caller owns resource resolution for .gltf sidecars. This module is browser
 * and Node compatible: disk I/O belongs to ./node.ts.
 */
import * as THREE from 'three';
import { createSceneDocument } from './document.js';
import { assertValidSceneDocument } from './validate.js';
import type { SceneDocument, SceneMaterial, SceneNode, SceneTransform, Vec3, Quat } from './types.js';

export type GltfBytes = string | Uint8Array | ArrayBuffer;
type Json = Record<string, any>;
export interface GltfSource { json: Json; bin?: Uint8Array; format: 'gltf' | 'glb'; }
export interface GltfImportOptions {
  id: string;
  name?: string;
  /** Path/URL to the source .gltf or .glb, relative to the future .iamscene file. */
  assetUri: string;
  /** Defaults to the glTF active scene. */
  sceneIndex?: number;
}
export interface GltfExportOptions {
  format: 'gltf' | 'glb';
  /** Resolves source-relative external buffer/image URIs, never remote by default. */
  resolveUri?: (uri: string) => Promise<Uint8Array>;
}

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function asBytes(value: GltfBytes): Uint8Array {
  return typeof value === 'string' ? encoder.encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value);
}
function fail(message: string): never { throw new Error('iamscene_gltf_' + message); }
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('json_object_required');
  return value as Json;
}
function list(value: unknown): Json[] {
  return Array.isArray(value) ? value as Json[] : [];
}
function clamp(value: number): number { return Math.min(1, Math.max(0, value)); }
function colorHex(value: number[] | undefined): string {
  const components = value?.slice(0, 3) ?? [1, 1, 1];
  return '#' + components.map(v => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('');
}
function rgb(value: string): [number, number, number] {
  const color = new THREE.Color(value);
  // Imported glTF factors are linear, while authored hex is display/sRGB.
  return [color.r, color.g, color.b];
}
function safeId(value: string): string {
  const candidate = value.replace(/[^A-Za-z0-9_.:-]+/g, '-').slice(0, 96);
  return /^[A-Za-z0-9]/.test(candidate) ? candidate : 'gltf-' + candidate;
}
function clone<T>(value: T): T { return structuredClone(value); }
function pad4(value: number): number { return (value + 3) & ~3; }

export function parseGltfAsset(input: GltfBytes): GltfSource {
  const bytes = asBytes(input);
  if (bytes.byteLength > 512 * 1024 * 1024) fail('source_too_large');
  let result: GltfSource;
  if (bytes.length >= 12 && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) === GLB_MAGIC) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) fail('glb_header_invalid');
    let cursor = 12, json: Json | undefined, bin: Uint8Array | undefined;
    let index = 0;
    while (cursor < bytes.length) {
      if (cursor + 8 > bytes.length) fail('glb_chunk_truncated');
      const length = view.getUint32(cursor, true);
      const type = view.getUint32(cursor + 4, true);
      cursor += 8;
      if (length % 4 || cursor + length > bytes.length) fail('glb_chunk_length_invalid');
      const chunk = bytes.subarray(cursor, cursor + length);
      if (index === 0 && type !== JSON_CHUNK) fail('glb_json_chunk_first_required');
      if (type === JSON_CHUNK) {
        if (json) fail('glb_duplicate_json_chunk');
        try { json = object(JSON.parse(decoder.decode(chunk).replace(/[ \t\r\n\0]+$/g, ''))); }
        catch { fail('glb_json_invalid'); }
      } else if (type === BIN_CHUNK) {
        if (bin) fail('glb_duplicate_bin_chunk');
        bin = chunk.slice();
      }
      cursor += length;
      index++;
    }
    if (!json) fail('glb_json_chunk_missing');
    result = { json, bin, format: 'glb' };
  } else {
    let json: Json;
    try { json = object(JSON.parse(decoder.decode(bytes))); }
    catch { fail('json_invalid'); }
    result = { json, format: 'gltf' };
  }
  if (result.json.asset?.version !== '2.0') fail('version_2_required');
  if (!Array.isArray(result.json.scenes) && !Array.isArray(result.json.nodes)) fail('scenes_or_nodes_required');
  for (const name of ['scenes', 'nodes', 'meshes', 'materials', 'cameras', 'animations', 'buffers', 'bufferViews', 'accessors']) {
    if (result.json[name] !== undefined && !Array.isArray(result.json[name])) fail('invalid_' + name);
  }
  return result;
}

function sceneTransform(source: Json): SceneTransform {
  if (Array.isArray(source.matrix)) {
    if (source.matrix.length !== 16 || !source.matrix.every((v: unknown) => typeof v === 'number' && Number.isFinite(v))) fail('matrix_invalid');
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
    new THREE.Matrix4().fromArray(source.matrix).decompose(pos, quat, scale);
    return { position: pos.toArray() as Vec3, rotation: quat.toArray() as Quat, scale: scale.toArray() as Vec3 };
  }
  return {
    position: (source.translation || [0, 0, 0]) as Vec3,
    rotation: (source.rotation || [0, 0, 0, 1]) as Quat,
    scale: (source.scale || [1, 1, 1]) as Vec3,
  };
}

function materialFromGltf(raw: Json, index: number): SceneMaterial {
  const pbr = raw.pbrMetallicRoughness || {};
  const factor = pbr.baseColorFactor ?? [1, 1, 1, 1];
  return {
    id: 'gltf-material-' + index,
    baseColor: colorHex(factor),
    metalness: pbr.metallicFactor ?? 1,
    roughness: pbr.roughnessFactor ?? 1,
    opacity: factor[3] ?? 1,
    transparent: raw.alphaMode === 'BLEND',
    emissive: colorHex(raw.emissiveFactor ?? [0, 0, 0]),
    emissiveIntensity: raw.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1,
  };
}

/** Creates one independently editable .iamscene node per imported glTF node. */
export function importGltfScene(input: GltfBytes, options: GltfImportOptions): SceneDocument {
  if (!options?.id || !options.assetUri) fail('import_id_and_asset_uri_required');
  const source = parseGltfAsset(input);
  const gltf = source.json;
  const doc = createSceneDocument({
    id: safeId(options.id), name: options.name || gltf.asset?.generator || options.id,
    metadata: { provenance: { sourceFormat: source.format, assetUri: options.assetUri, generator: gltf.asset?.generator || null } },
  });
  const assetId = 'gltf-source';
  doc.assets.push({ id: assetId, uri: options.assetUri, mediaType: source.format === 'glb' ? 'model/gltf-binary' : 'model/gltf+json', role: 'geometry-source', units: 'm' });
  const materials = list(gltf.materials);
  doc.materials.push(...materials.map((entry, i) => materialFromGltf(entry, i)));
  const definitions = list(gltf.nodes);
  const roots = list(gltf.scenes);
  const sceneIndex = options.sceneIndex ?? gltf.scene ?? 0;
  if (roots.length && (!Number.isInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= roots.length)) fail('scene_index_invalid');
  const reachable = new Set<number>(), parents = new Map<number, number>();
  const seenStack = new Set<number>();
  function visit(index: number, parent?: number) {
    if (!Number.isInteger(index) || index < 0 || index >= definitions.length) fail('node_reference_invalid');
    if (seenStack.has(index)) fail('node_hierarchy_cycle');
    if (parent !== undefined && parents.has(index) && parents.get(index) !== parent) fail('multiple_parents_unsupported');
    if (parent !== undefined) parents.set(index, parent);
    if (reachable.has(index)) return;
    seenStack.add(index);
    reachable.add(index);
    for (const child of (definitions[index].children || [])) visit(child, index);
    seenStack.delete(index);
  }
  const rootIndices: number[] = roots.length ? roots[sceneIndex].nodes || [] : definitions.map((_, i) => i);
  for (const index of rootIndices) visit(index);
  const rootNode = doc.scene.nodes.find(n => n.id === 'scene-root')!;
  rootNode.name = roots[sceneIndex]?.name || 'Scene';
  rootNode.userData = { iamGltf: { assetId, sceneIndex, defaultScene: gltf.scene ?? sceneIndex } };
  for (const index of reachable) {
    const raw = definitions[index];
    const mesh = typeof raw.mesh === 'number' ? list(gltf.meshes)[raw.mesh] : undefined;
    if (raw.mesh !== undefined && !mesh) fail('mesh_reference_invalid');
    const primitives = mesh?.primitives || [];
    let materialRef: string | undefined;
    if (primitives.length === 1 && Number.isInteger(primitives[0].material)) materialRef = 'gltf-material-' + primitives[0].material;
    const id = 'gltf-node-' + index;
    const node: SceneNode = {
      id, name: raw.name || 'Node ' + index,
      kind: mesh ? 'mesh' : 'group',
      parentId: parents.has(index) ? 'gltf-node-' + parents.get(index) : 'scene-root',
      transform: sceneTransform(raw), visible: true,
      ...(mesh ? { assetRef: assetId } : {}),
      ...(materialRef ? { materialRef } : {}),
      userData: {
        iamGltf: {
          assetId, nodeIndex: index, ...(mesh ? { meshIndex: raw.mesh } : {}),
          ...(Number.isInteger(raw.camera) ? { cameraIndex: raw.camera } : {}),
          importedTransform: sceneTransform(raw),
        },
        ...(raw.extras ? { gltfExtras: clone(raw.extras) } : {}),
      },
    };
    doc.scene.nodes.push(node);
  }
  // GlTF animation samplers, skins, lights, texture channels and extensions
  // remain in the original geometry source; editing these requires native
  // adapters instead of silently dropping their binary/accessor data.
  doc.metadata.provenance = {
    ...doc.metadata.provenance, gltfSceneIndex: sceneIndex,
    gltfAnimations: list(gltf.animations).map((v, i) => ({ index: i, name: v.name || 'Animation ' + i, channels: list(v.channels).length })),
    gltfExtensionsUsed: [...(gltf.extensionsUsed || [])],
    gltfExtensionsRequired: [...(gltf.extensionsRequired || [])],
  };
  assertValidSceneDocument(doc);
  return doc;
}

function normalizedTransform(transform: SceneTransform): SceneTransform {
  return { position: transform.position || [0,0,0], rotation: transform.rotation || [0,0,0,1], scale: transform.scale || [1,1,1] };
}
function sameTransform(a: SceneTransform, b: SceneTransform): boolean {
  return JSON.stringify(normalizedTransform(a)) === JSON.stringify(normalizedTransform(b));
}
function patchMaterial(raw: Json, native: SceneMaterial) {
  const pbr = raw.pbrMetallicRoughness ??= {};
  const alpha = native.opacity ?? 1;
  const factor = [...rgb(native.baseColor), alpha];
  pbr.baseColorFactor = factor;
  pbr.metallicFactor = native.metalness ?? 1;
  pbr.roughnessFactor = native.roughness ?? 1;
  if (native.transparent || alpha < 1) raw.alphaMode = 'BLEND';
  else if (raw.alphaMode === 'BLEND') raw.alphaMode = 'OPAQUE';
  raw.emissiveFactor = rgb(native.emissive || '#000000');
  if (native.emissiveIntensity !== undefined && native.emissiveIntensity !== 1) {
    raw.extensions ??= {};
    raw.extensions.KHR_materials_emissive_strength = { emissiveStrength: native.emissiveIntensity };
  }
}

/** Applies native scene edits to the original glTF while preserving opaque payloads. */
export function projectSceneToGltf(document: SceneDocument, original: GltfSource): GltfSource {
  assertValidSceneDocument(document);
  const gltf = clone(original.json);
  const nodes = list(gltf.nodes);
  const sceneIndex = Number(document.metadata.provenance?.gltfSceneIndex ?? gltf.scene ?? 0);
  const scenes = list(gltf.scenes);
  if (!scenes[sceneIndex]) fail('export_source_scene_missing');
  const sourceAsset = document.assets.find(a => a.id === 'gltf-source');
  if (!sourceAsset) fail('export_original_source_missing');
  const root = document.scene.nodes.find(n => n.id === 'scene-root');
  if (!root) fail('export_scene_root_missing');
  const nativeNodeMap = new Map(document.scene.nodes.map(n => [n.id, n]));
  const idToIndex = new Map<string, number>();
  for (const node of document.scene.nodes) {
    const binding = node.userData?.iamGltf as Json | undefined;
    if (!binding || !Number.isInteger(binding.nodeIndex)) {
      if (node.id === 'scene-root') continue;
      if (node.kind !== 'group') fail('export_native_mesh_requires_geometry_adapter:' + node.id);
      idToIndex.set(node.id, nodes.length);
      nodes.push({ name: node.name });
      continue;
    }
    if (binding.assetId !== sourceAsset.id || binding.nodeIndex < 0 || binding.nodeIndex >= nodes.length) fail('export_node_binding_invalid:' + node.id);
    if (idToIndex.has(node.id)) fail('export_node_binding_duplicate');
    idToIndex.set(node.id, binding.nodeIndex);
  }
  const touched = new Set<number>();
  for (const native of document.scene.nodes) {
    if (native.id === 'scene-root') continue;
    const index = idToIndex.get(native.id);
    if (index === undefined) fail('export_node_index_missing');
    if (touched.has(index)) fail('export_node_index_duplicate');
    touched.add(index);
    const target = nodes[index];
    const binding = (native.userData?.iamGltf || {}) as Json;
    if (binding.meshIndex !== undefined && target.mesh !== binding.meshIndex) fail('export_source_mesh_changed');
    target.name = native.name;
    if (!binding.importedTransform || !sameTransform(native.transform, binding.importedTransform)) {
      delete target.matrix;
      target.translation = clone(native.transform.position || [0,0,0]);
      target.rotation = clone(native.transform.rotation || [0,0,0,1]);
      target.scale = clone(native.transform.scale || [1,1,1]);
    }
    target.children = document.scene.nodes.filter(n => n.parentId === native.id).map(n => {
      const child = idToIndex.get(n.id);
      if (child === undefined) fail('export_child_unresolved');
      return child;
    });
    if (!target.children.length) delete target.children;
    // Preserve material assignment only when a mesh has exactly one primitive.
    if (native.kind === 'mesh' && native.materialRef) {
      const mesh = list(gltf.meshes)[target.mesh];
      if (!mesh) fail('export_mesh_not_found');
      if (list(mesh.primitives).length !== 1) fail('export_multi_primitive_material_edit_unsupported:' + native.id);
      const indexText = native.materialRef.match(/^gltf-material-(\d+)$/);
      if (!indexText) fail('export_material_ref_not_imported:' + native.materialRef);
      mesh.primitives[0].material = Number(indexText[1]);
    }
  }
  gltf.nodes = nodes;
  scenes[sceneIndex].nodes = document.scene.nodes
    .filter(n => n.parentId === 'scene-root')
    .map(n => idToIndex.get(n.id)!)
    .filter(Number.isInteger);
  // Never drop external binary resource references, textures, animations or skins.
  // Edits to the asset's authored material factors are reflected in the source.
  for (const native of document.materials) {
    const match = native.id.match(/^gltf-material-(\d+)$/);
    if (match && list(gltf.materials)[Number(match[1])]) patchMaterial(gltf.materials[Number(match[1])], native);
  }
  // The original glTF contains its own animation hierarchy; publishing an
  // unbound native animation would otherwise silently lose authored motion.
  if (document.animations.length) fail('export_native_animation_requires_adapter');
  gltf.scenes = scenes;
  return { json: gltf, ...(original.bin ? { bin: original.bin } : {}), format: original.format };
}

function base64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
function fromData(uri: string): Uint8Array {
  const match = uri.match(/^data:([^,]*?),(.*)$/s);
  if (!match) fail('data_uri_invalid');
  const binary = /;base64$/i.test(match[1]);
  if (!binary) return encoder.encode(decodeURIComponent(match[2]));
  const decoded = atob(match[2]);
  return Uint8Array.from(decoded, c => c.charCodeAt(0));
}
async function resourceBytes(uri: string, resolve?: (uri: string) => Promise<Uint8Array>): Promise<Uint8Array> {
  if (uri.startsWith('data:')) return fromData(uri);
  if (!resolve) fail('external_resource_resolver_required:' + uri);
  const bytes = await resolve(uri);
  if (!(bytes instanceof Uint8Array)) fail('external_resource_not_bytes:' + uri);
  return bytes;
}
function imageMime(uri: string, data: Uint8Array): string {
  const dataMime = uri.match(/^data:([^;,]+)/)?.[1];
  if (dataMime) return dataMime;
  const lower = uri.split('?')[0].toLowerCase();
  if (lower.endsWith('.png') || (data[0] === 137 && data[1] === 80)) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || (data[0] === 255 && data[1] === 216)) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.ktx2')) return 'image/ktx2';
  fail('image_mimetype_unknown:' + uri);
}

/** Encodes valid standalone glTF JSON (embedded resources) or a GLB container. */
export async function encodeGltfAsset(source: GltfSource, opts: GltfExportOptions): Promise<string | Uint8Array> {
  const doc = clone(source.json);
  if (doc.asset?.version !== '2.0') fail('version_2_required');
  const buffers = list(doc.buffers);
  const byteSets: Uint8Array[] = [];
  for (let i = 0; i < buffers.length; i++) {
    const buffer = buffers[i];
    let bytes: Uint8Array;
    if (typeof buffer.uri === 'string') bytes = await resourceBytes(buffer.uri, opts.resolveUri);
    else if (i === 0 && source.bin) bytes = source.bin;
    else fail('missing_bin_buffer:' + i);
    if (bytes.length < buffer.byteLength || bytes.length > buffer.byteLength + 3 && !buffer.uri) fail('buffer_byte_length_mismatch:' + i);
    byteSets.push(bytes.subarray(0, buffer.byteLength));
  }
  if (opts.format === 'gltf') {
    for (let i = 0; i < buffers.length; i++) {
      buffers[i].uri = 'data:application/octet-stream;base64,' + base64(byteSets[i]);
    }
    for (const image of list(doc.images)) {
      if (typeof image.uri === 'string' && !image.uri.startsWith('data:')) {
        const bytes = await resourceBytes(image.uri, opts.resolveUri);
        image.uri = 'data:' + imageMime(image.uri, bytes) + ';base64,' + base64(bytes);
      }
    }
    return JSON.stringify(doc, null, 2) + '\n';
  }
  if (opts.format !== 'glb') fail('format_invalid');
  const chunks: Uint8Array[] = [];
  let length = 0;
  function append(data: Uint8Array): number {
    const offset = pad4(length);
    if (offset > length) chunks.push(new Uint8Array(offset - length));
    length = offset;
    chunks.push(data);
    length += data.length;
    return offset;
  }
  const positions = byteSets.map(append);
  for (const view of list(doc.bufferViews)) {
    if (!Number.isInteger(view.buffer) || !byteSets[view.buffer]) fail('buffer_view_invalid');
    view.byteOffset = positions[view.buffer] + (view.byteOffset || 0);
    view.buffer = 0;
  }
  for (const image of list(doc.images)) {
    if (typeof image.uri !== 'string') continue;
    const bytes = await resourceBytes(image.uri, opts.resolveUri);
    const view = doc.bufferViews ??= [];
    const id = view.length;
    view.push({ buffer: 0, byteOffset: append(bytes), byteLength: bytes.byteLength });
    image.mimeType = imageMime(image.uri, bytes);
    image.bufferView = id;
    delete image.uri;
  }
  const packed = new Uint8Array(pad4(length));
  let offset = 0;
  for (const chunk of chunks) { packed.set(chunk, offset); offset += chunk.length; }
  if (length) doc.buffers = [{ byteLength: length }];
  else delete doc.buffers;
  const json = encoder.encode(JSON.stringify(doc));
  const jsonLength = pad4(json.length), binLength = packed.length;
  const includeBin = Boolean(binLength);
  const total = 12 + 8 + jsonLength + (includeBin ? 8 + binLength : 0);
  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, JSON_CHUNK, true);
  output.fill(0x20, 20, 20 + jsonLength);
  output.set(json, 20);
  if (includeBin) {
    const binOffset = 20 + jsonLength;
    view.setUint32(binOffset, binLength, true);
    view.setUint32(binOffset + 4, BIN_CHUNK, true);
    output.set(packed, binOffset + 8);
  }
  return output;
}
