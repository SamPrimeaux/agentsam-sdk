/**
 * Read-only glTF 2.0 resource graph from a local source document.
 * Materials, meshes, cameras, nodes, and scenes remain independent objects,
 * addressed by JSON Pointer and protected by a source-content hash.
 *
 * This is NOT a BIM/IFC/OCCT parser. Other creative formats need their own
 * schema-aware adapters, never a generic text-chunk substitute.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readSource } from '../knowledge/source.js';

const GROUPS = ['scenes', 'nodes', 'meshes', 'materials', 'textures', 'images', 'samplers', 'cameras', 'skins', 'animations'];

export function inspectLiveGltf(root, file, options = {}) {
  const base = fs.realpathSync(path.resolve(root || process.cwd()));
  if (!fs.statSync(base).isDirectory()) throw new Error('Root must be a directory');
  const rel = String(file || '').replaceAll('\\', '/');
  if (!rel || path.isAbsolute(rel) || rel.split('/').includes('..') || !/\.gltf$/i.test(rel)) {
    throw new Error('A workspace-relative .gltf file is required');
  }
  const abs = path.resolve(base, rel);
  if (!abs.startsWith(base + path.sep)) throw new Error('Path outside authorized root');
  const source = readSource(base, rel);
  if (!source) throw new Error('glTF source unavailable, non-text, symlinked, or over the 2 MiB live-read limit');
  let gltf;
  try { gltf = JSON.parse(source.content); } catch (error) { throw new Error('Invalid glTF JSON: ' + error.message); }
  if (!/^2\./.test(String(gltf?.asset?.version || ''))) throw new Error('This adapter requires glTF 2.x');
  const maxNodes = Number.isInteger(options.maxNodes) && options.maxNodes > 0 ? Math.min(options.maxNodes, 2000) : 500;
  const nodes = [];
  const edges = [];
  const diagnostics = [];
  const total = GROUPS.reduce((sum, key) => sum + (Array.isArray(gltf[key]) ? gltf[key].length : 0), 0);
  function pointer(group, index) { return '/' + group + '/' + index; }
  function link(from, targetGroup, targetIndex, type) {
    if (!Number.isInteger(targetIndex)) return;
    const to = pointer(targetGroup, targetIndex);
    const valid = Array.isArray(gltf[targetGroup]) && targetIndex >= 0 && targetIndex < gltf[targetGroup].length;
    edges.push({ from, to, type, resolved: valid });
    if (!valid && diagnostics.length < 50) diagnostics.push({ code: 'broken_gltf_reference', from, to, type });
  }
  for (const group of GROUPS) {
    const values = Array.isArray(gltf[group]) ? gltf[group] : [];
    for (let index = 0; index < values.length && nodes.length < maxNodes; index++) {
      const data = values[index];
      if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
      const id = pointer(group, index);
      nodes.push({
        id,
        kind: group === 'meshes' ? 'mesh' : group.slice(0, -1),
        name: typeof data.name === 'string' ? data.name : group + '[' + index + ']',
        persistent_id: data.extras?.agentsam_id || data.extras?.uuid || null,
        locator: { path: rel, json_pointer: id, source_hash: source.hash },
        properties: Object.keys(data),
        ...(group === 'nodes' ? { transform: {
          translation: data.translation || null, rotation: data.rotation || null,
          scale: data.scale || null, matrix: data.matrix || null,
        }} : {}),
        ...(group === 'materials' ? { pbr: data.pbrMetallicRoughness || null } : {}),
      });
      if (group === 'scenes') for (const n of data.nodes || []) link(id, 'nodes', n, 'contains');
      if (group === 'nodes') {
        for (const n of data.children || []) link(id, 'nodes', n, 'child');
        link(id, 'meshes', data.mesh, 'mesh');
        link(id, 'cameras', data.camera, 'camera');
        link(id, 'skins', data.skin, 'skin');
      }
      if (group === 'meshes') for (const prim of data.primitives || []) link(id, 'materials', prim.material, 'material');
      if (group === 'materials') {
        link(id, 'textures', data.pbrMetallicRoughness?.baseColorTexture?.index, 'base_color_texture');
        link(id, 'textures', data.pbrMetallicRoughness?.metallicRoughnessTexture?.index, 'metallic_roughness_texture');
        link(id, 'textures', data.normalTexture?.index, 'normal_texture');
        link(id, 'textures', data.occlusionTexture?.index, 'occlusion_texture');
        link(id, 'textures', data.emissiveTexture?.index, 'emissive_texture');
      }
      if (group === 'textures') {
        link(id, 'images', data.source, 'image');
        link(id, 'samplers', data.sampler, 'sampler');
      }
      if (group === 'skins') for (const n of data.joints || []) link(id, 'nodes', n, 'joint');
      if (group === 'animations') {
        for (const channel of data.channels || []) link(id, 'nodes', channel.target?.node, 'animation_target');
      }
    }
    if (nodes.length >= maxNodes) break;
  }
  return {
    ok: true, route: 'live_resource_graph', format: 'gltf2', index_required: false,
    root: base, path: rel, source_hash: source.hash,
    root_scene: Number.isInteger(gltf.scene) ? pointer('scenes', gltf.scene) : null,
    nodes, edges, diagnostics, total_objects: total,
    truncated: nodes.length < total,
    caveat: 'Object paths identify elements in this source revision. Array reordering can change JSON Pointers; use persistent_id when authored.',
  };
}
