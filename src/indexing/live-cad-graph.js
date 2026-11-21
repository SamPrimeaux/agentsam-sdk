/**
 * Live CAD project graph. Consumes canonical, independently editable
 * cad.project.v1 and cad.project.v2 documents without changing them.
 * Syntax/data inspection only: not an OCCT/BRep/IFC geometry evaluator.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readSource } from '../knowledge/source.js';
import { CAD_PROJECT_V2, validateCadProjectV2 } from '../lib/cad/project-v2.js';
import { validateProject } from '../lib/cad/editable-project-contract.js';

const V1_GROUPS = ['walls', 'rooms', 'doors', 'windows', 'furniture', 'annotations', 'parametricObjects'];
const V2_GROUPS = ['assets', 'views', 'sheets', 'scenes', 'productions', 'outputs', 'packages', 'receipts', 'revisions'];

function jsonPointerSegment(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

export function inspectLiveCadProject(root, file, options = {}) {
  const base = fs.realpathSync(path.resolve(root || process.cwd()));
  if (!fs.statSync(base).isDirectory()) throw new Error('CAD root must be a directory');
  const rel = String(file || '').replaceAll('\\', '/');
  if (!rel || path.isAbsolute(rel) || rel.split('/').includes('..') || !/\.json$/i.test(rel)) {
    throw new Error('A workspace-relative JSON CAD project is required');
  }
  const source = readSource(base, rel);
  if (!source) throw new Error('CAD project source unavailable, symlinked, invalid, or exceeds the live-read limit');
  let decoded;
  try { decoded = JSON.parse(source.content); } catch (error) { throw new Error('Invalid CAD JSON: ' + error.message); }
  const wrapped = Boolean(decoded && typeof decoded === 'object' && decoded.project && typeof decoded.project === 'object');
  const project = wrapped ? decoded.project : decoded;
  const prefix = wrapped ? '/project' : '';
  const isV2 = project?.schema === CAD_PROJECT_V2;
  const validation = isV2 ? validateCadProjectV2(project) : validateProject(project);
  const maxNodes = Number.isInteger(options.maxNodes) && options.maxNodes > 0 ? Math.min(options.maxNodes, 3000) : 500;
  const nodes = [];
  const edges = [];
  const byIdentity = new Map();
  let totalObjects = 0;

  function add(items, group, pointerPrefix, parent = null) {
    if (!Array.isArray(items)) return;
    totalObjects += items.length;
    for (const [index, item] of items.entries()) {
      if (nodes.length >= maxNodes) break;
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const pointer = pointerPrefix + '/' + index;
      const stableId = typeof item.id === 'string' ? item.id : null;
      const node = {
        id: pointer,
        kind: String(item.kind || group.replace(/s$/, '')),
        group,
        name: String(item.name || stableId || group + '[' + index + ']'),
        stable_id: stableId,
        parent,
        locator: { path: rel, json_pointer: pointer, source_hash: source.hash },
        fields: Object.keys(item),
        ...(item.parameters && typeof item.parameters === 'object' ? { parameters: item.parameters } : {}),
      };
      nodes.push(node);
      if (stableId) byIdentity.set(stableId, node);
      if (parent) edges.push({ from: parent, to: pointer, type: 'contains', resolved: true });
      if (!isV2 && group === 'walls' && Array.isArray(item.assembly?.layers)) {
        add(item.assembly.layers, 'wall_assembly_layers', pointer + '/assembly/layers', pointer);
      }
    }
  }

  if (isV2) {
    add(project.geometry?.entities, 'geometry_entities', prefix + '/geometry/entities');
    add(project.geometry?.constraints, 'geometry_constraints', prefix + '/geometry/constraints');
    for (const group of V2_GROUPS) add(project[group], group, prefix + '/' + jsonPointerSegment(group));
    for (const relation of project.geometry?.relationships || []) {
      const from = byIdentity.get(relation?.from);
      const to = byIdentity.get(relation?.to);
      edges.push({
        from: from?.id || null, to: to?.id || null,
        type: String(relation?.kind || 'geometry_relationship'),
        relation_id: relation?.id || null,
        resolved: Boolean(from && to),
      });
    }
  } else {
    for (const group of V1_GROUPS) add(project[group], group, prefix + '/' + jsonPointerSegment(group));
    for (const group of ['doors', 'windows']) {
      for (const item of project[group] || []) {
        const from = byIdentity.get(item?.id);
        const to = byIdentity.get(item?.wallId);
        if (from) edges.push({
          from: from.id, to: to?.id || null,
          type: 'opening_of_wall', resolved: Boolean(to),
        });
      }
    }
  }
  return {
    ok: true, route: 'live_cad_project_graph', index_required: false,
    schema: isV2 ? CAD_PROJECT_V2 : 'cad.project.v1',
    project_id: project?.id || null, project_name: project?.name || null,
    domain: project?.domain || 'architecture.building',
    units: isV2 ? project?.coordinateSystem?.unit : 'in',
    source_hash: source.hash, path: rel,
    valid: validation.valid, validation_errors: validation.errors,
    nodes, edges, total_objects: totalObjects, truncated: totalObjects > nodes.length,
    note: 'Read-only schema inspection. Native OCCT geometry, IFC relations and FreeCAD document objects require separate format adapters.',
  };
}
