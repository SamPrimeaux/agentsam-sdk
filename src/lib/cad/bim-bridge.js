/**
 * Read-only IFC semantic import bridge. Preserves the original IFC as authority
 * while exposing its inspected spatial tree, types, spaces and relationships in
 * cad.project.v2. No geometrical reconstruction, parametric editing, or IFC
 * export is implied: those need a verified IfcOpenShell authoring provider.
 */
import { assertBimModel } from '@inneranimalmedia/agentsam-contracts/bim-model';
import { createCadProjectV2 } from './project-v2.js';

/** IFC GUIDs allow $ and _; encode losslessly into portable CAD-safe IDs. */
export const cadIdForIfcGlobalId = globalId =>
  'ifc:' + Array.from(globalId, c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');

const safeUri = uri => typeof uri === 'string' && uri.length > 0
  && uri.length <= 4096 && !/^(?:javascript|data):/i.test(uri);

export function projectFromIfcInspection(model, { id, name, sourceUri, revision = 1 } = {}) {
  assertBimModel(model);
  if (model.truncated) throw new Error('cad_ifc_inspection_incomplete');
  if (!safeUri(sourceUri)) throw new Error('cad_ifc_source_uri_required');
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('cad_ifc_revision_invalid');

  const spatial = [], relations = [], entities = [];
  const known = new Set();
  function entity(globalId, kind, data) {
    const entityId = cadIdForIfcGlobalId(globalId);
    if (known.has(entityId)) throw new Error('cad_ifc_duplicate_global_id');
    known.add(entityId);
    entities.push({ id: entityId, kind, data: structuredClone(data) });
  }
  function edge(kind, from, to) {
    if (!from || !to) return;
    relations.push({ id: 'rel:' + kind + ':' + relations.length, kind,
      from: cadIdForIfcGlobalId(from), to: cadIdForIfcGlobalId(to) });
  }
  function visitSpatial(node, parent = null) {
    if (!node) return;
    spatial.push(node);
    entity(node.globalId, node.ifcClass, {
      globalId: node.globalId, name: node.name, elevationM: node.elevationM ?? null,
      semanticOnly: true,
    });
    if (parent) edge('spatial-parent', node.globalId, parent);
    for (const child of node.children) visitSpatial(child, node.globalId);
  }
  visitSpatial(model.spatial);
  for (const space of model.spaces) entity(space.globalId, 'IfcSpace', {
    ...space, semanticOnly: true,
  });
  for (const element of model.elements) entity(element.globalId, element.ifcClass, {
    ...element, geometryAuthority: 'source-ifc',
  });
  for (const space of model.spaces) edge('contained-in', space.globalId, space.containerId);
  for (const element of model.elements) {
    edge('contained-in', element.globalId, element.containerId);
    edge('voids', element.globalId, element.hostId);
    edge('fills', element.globalId, element.fillsOpeningId);
  }
  // A broken reference may have been cleared by the IFC inspector. Do not
  // silently create invalid CAD relationships when inspection is incomplete.
  for (const rel of relations) if (!known.has(rel.from) || !known.has(rel.to))
    throw new Error('cad_ifc_relation_unresolved:' + rel.kind);

  if (entities.length > 50_000) throw new Error('cad_ifc_semantic_projection_requires_pagination');
  const byClass = type => spatial.filter(n => n.ifcClass === type)
    .map(n => ({ globalId: n.globalId, name: n.name, elevationM: n.elevationM ?? null }));

  const result = createCadProjectV2({
    id, name: name ?? model.project.name ?? 'Imported IFC', revision,
    unit: 'm', domain: 'architecture.building',
    geometry: { entities, relationships: relations, constraints: [] },
    modules: { architecture: {
      schema: 'cad.module.architecture.v1', version: 1,
      sites: byClass('IfcSite'), buildings: byClass('IfcBuilding'),
      storeys: byClass('IfcBuildingStorey'), spaces: structuredClone(model.spaces),
      relationships: structuredClone(relations),
      bim: {
        sourceSchema: model.source.ifcSchema,
        sourceGlobalId: model.project.globalId,
        sourceSha256: model.source.sha256,
        sourceLengthScaleToM: model.project.lengthScaleToM,
        elementTypes: structuredClone(model.types),
        counts: structuredClone(model.counts),
        warnings: [...model.warnings],
        semanticProjectionOnly: true,
      },
    } },
  });
  result.assets.push({
    id: 'source-ifc', role: 'source', status: 'available',
    uri: sourceUri, sha256: model.source.sha256,
    mediaType: 'application/x-step', byteSize: model.source.byteLength,
    formatRef: { catalog: 'agentsam.source-types.v2', id: 'bim.ifc', extension: '.ifc' },
  });
  return result;
}
