/** AgentSam BIM semantic model: the engine-neutral shape of what an IFC file MEANS.
 *
 * Geometry lives in the IFC (and its derived GLB). This document carries the
 * semantics: spatial tree, element types, materials, property sets, quantities,
 * the wall -> opening -> door chain and spaces, all keyed by IFC GlobalId so a
 * viewer pick, a schedule row and an edit operation refer to the same object.
 *
 * Engines produce it (IfcOpenShell on the CAD service, web-ifc in a browser);
 * consumers never care which. Lengths are meters and areas square meters here
 * regardless of the unit declared in the source IFC.
 * A validating document is not proof the source IFC is complete or valid BIM.
 */
export const AGENTSAM_BIM_MODEL = 'agentsam.bim.model.v1' as const;

export type BimScalar = string | number | boolean | null;
export type BimPropertySets = Record<string, Record<string, BimScalar>>;

export interface BimLayer { material: string; thicknessM: number | null }
export interface BimMaterial { name: string; layers?: BimLayer[] }

export interface BimSpatialNode {
  globalId: string;
  ifcClass: string;
  name: string | null;
  /** Storeys only: elevation above the project datum, meters. */
  elevationM?: number | null;
  children: BimSpatialNode[];
}

export interface BimType {
  globalId: string;
  ifcClass: string;
  name: string | null;
  predefinedType: string | null;
  material?: BimMaterial;
  psets: BimPropertySets;
}

export interface BimElement {
  globalId: string;
  ifcClass: string;
  name: string | null;
  predefinedType: string | null;
  /** GlobalId of the element's BimType, if it has one. */
  typeId: string | null;
  /** GlobalId of the storey / building / space that contains it. */
  containerId: string | null;
  material?: BimMaterial;
  psets: BimPropertySets;
  qtos: BimPropertySets;
  /** IfcOpeningElement only: the element it cuts (IfcRelVoidsElement). */
  hostId: string | null;
  /** Host elements: openings that cut them. */
  openingIds: string[];
  /** Door/window: the opening it fills (IfcRelFillsElement). */
  fillsOpeningId: string | null;
}

export interface BimSpace {
  globalId: string;
  name: string | null;
  longName: string | null;
  containerId: string | null;
  usage: string | null;
  netFloorAreaM2: number | null;
  grossFloorAreaM2: number | null;
  heightM: number | null;
  /** True when the IfcSpace carries real floor geometry, not just a label. */
  hasGeometry: boolean;
}

export interface BimModel {
  schema: typeof AGENTSAM_BIM_MODEL;
  source: { ifcSchema: string; sha256: string; byteLength: number };
  project: { globalId: string; name: string | null; lengthUnit: string; lengthScaleToM: number };
  spatial: BimSpatialNode | null;
  types: BimType[];
  elements: BimElement[];
  spaces: BimSpace[];
  /** Every IFC class present in the source -> instance count (all classes, not just those listed above). */
  counts: Record<string, number>;
  /** True when a safety cap stopped the lists above short of the full model. */
  truncated: boolean;
  warnings: string[];
}

const GLOBAL_ID = /^[0-9A-Za-z_$]{22}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function fail(code: string): never { throw new Error(`agentsam_bim_model_${code}`); }

function walk(node: BimSpatialNode, visit: (n: BimSpatialNode) => void): void {
  visit(node);
  if (!Array.isArray(node.children)) fail('spatial_children_invalid');
  for (const child of node.children) walk(child, visit);
}

/** Structural plus referential check. Throws `agentsam_bim_model_<reason>`. */
export function assertBimModel(value: unknown): asserts value is BimModel {
  const m = value as BimModel | null;
  if (!m || typeof m !== 'object' || Array.isArray(m)) fail('not_object');
  if (m.schema !== AGENTSAM_BIM_MODEL) fail('schema_tag');
  if (!m.source || typeof m.source.ifcSchema !== 'string' || !SHA256.test(m.source.sha256) ||
    !Number.isSafeInteger(m.source.byteLength) || m.source.byteLength < 0) fail('source_invalid');
  if (!m.project || !GLOBAL_ID.test(m.project.globalId) || typeof m.project.lengthUnit !== 'string' ||
    !Number.isFinite(m.project.lengthScaleToM) || m.project.lengthScaleToM <= 0) fail('project_invalid');
  for (const key of ['types', 'elements', 'spaces', 'warnings'] as const) {
    if (!Array.isArray(m[key])) fail(`${key}_not_array`);
  }
  if (!m.counts || typeof m.counts !== 'object' || Array.isArray(m.counts) ||
    Object.values(m.counts).some(n => !Number.isSafeInteger(n) || n < 0)) fail('counts_invalid');
  if (typeof m.truncated !== 'boolean') fail('truncated_invalid');

  const ids = new Set<string>();
  const claim = (id: unknown): string => {
    if (typeof id !== 'string' || !GLOBAL_ID.test(id)) fail('global_id_invalid');
    if (ids.has(id)) fail('global_id_duplicate');
    ids.add(id);
    return id;
  };
  const spatialIds = new Set<string>();
  ids.add(m.project.globalId);
  if (m.spatial) walk(m.spatial, n => { spatialIds.add(claim(n.globalId)); });
  const typeIds = new Set<string>();
  for (const t of m.types) typeIds.add(claim(t.globalId));
  const elementIds = new Set<string>();
  for (const e of m.elements) elementIds.add(claim(e.globalId));
  const spaceIds = new Set<string>();
  for (const s of m.spaces) spaceIds.add(claim(s.globalId));

  // Elements may sit in a storey/building or inside a space.
  const containers = new Set<string>([...spatialIds, ...spaceIds]);
  for (const e of m.elements) {
    if (e.typeId !== null && !typeIds.has(e.typeId)) fail('type_ref_unresolved');
    if (e.containerId !== null && !containers.has(e.containerId)) fail('container_ref_unresolved');
    if (e.hostId !== null && !elementIds.has(e.hostId)) fail('host_ref_unresolved');
    if (e.fillsOpeningId !== null && !elementIds.has(e.fillsOpeningId)) fail('fill_ref_unresolved');
    if (!Array.isArray(e.openingIds) || e.openingIds.some(id => !elementIds.has(id))) fail('opening_ref_unresolved');
  }
  for (const s of m.spaces) {
    if (s.containerId !== null && !spatialIds.has(s.containerId)) fail('space_container_unresolved');
  }
}
