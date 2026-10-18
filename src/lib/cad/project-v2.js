/**
 * Portable CAD project v2: project authority and verifiable deliverable *intents*.
 * Does not implement or impersonate a native CAD engine, professional seal,
 * identity, asset store, queue or GOAP machinery.
 */
import { requireValidProject } from './project-contract.js';

export const CAD_PROJECT_V2 = 'cad.project.v2';
export const CAD_DOMAINS = Object.freeze([
  'architecture.building', 'mechanical.part', 'mechanical.assembly',
  'product.design', 'site.landscape', 'general.cad',
]);
export const CAD_UNITS = Object.freeze(['in', 'mm', 'cm', 'm', 'ft']);
const unitsPerInch = Object.freeze({in: 1, mm: 25.4, cm: 2.54, m: 0.0254, ft: 1 / 12});
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
const isSha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validUri = value => typeof value === 'string' && value.length > 0 && !/^javascript:/i.test(value);
const groupsV1 = ['walls', 'rooms', 'doors', 'windows', 'furniture', 'annotations'];
const states = new Set(['planned', 'queued', 'running', 'generated', 'validated', 'approved', 'stale', 'failed', 'blocked']);
const profiles = Object.freeze({
  'architecture.building': 'architecture',
  'mechanical.part': 'mechanical',
  'mechanical.assembly': 'mechanical',
  'site.landscape': 'landscape',
  'product.design': 'product',
});
export const resolveCadDomainModule = domain => profiles[domain] ?? null;

/** Metadata is not an execution or authorization grant. */
export function validateCadProjectV2(project) {
  const errors = [];
  if (!isRecord(project)) return { valid: false, errors: ['project_required'] };
  if (project.schema !== CAD_PROJECT_V2) errors.push('schema_must_be_cad.project.v2');
  if (!isId(project.id) || !project.name || typeof project.name !== 'string') errors.push('invalid_project_identity');
  if (!CAD_DOMAINS.includes(project.domain)) errors.push('unsupported_cad_domain');
  if (!isRecord(project.coordinateSystem)
      || !CAD_UNITS.includes(project.coordinateSystem.unit)
      || project.coordinateSystem.upAxis !== 'Z'
      || project.coordinateSystem.handedness !== 'right'
      || !Array.isArray(project.coordinateSystem.origin)
      || project.coordinateSystem.origin.length !== 3
      || !project.coordinateSystem.origin.every(n => typeof n === 'number' && Number.isFinite(n))) {
    errors.push('invalid_coordinate_system');
  }
  if (!isRecord(project.geometry) || !Array.isArray(project.geometry.entities)
      || !Array.isArray(project.geometry.relationships) || !Array.isArray(project.geometry.constraints)) {
    errors.push('geometry_collections_required');
  }
  const elementIds = new Set();
  for (const e of project.geometry?.entities ?? []) {
    if (!isRecord(e) || !isId(e.id) || !e.kind || elementIds.has(e.id)) errors.push('invalid_or_duplicate_geometry_id');
    else elementIds.add(e.id);
  }
  for (const relation of project.geometry?.relationships ?? []) {
    if (!isRecord(relation) || !isId(relation.id) || !elementIds.has(relation.from) || !elementIds.has(relation.to))
      errors.push('invalid_geometry_relationship');
  }
  if (!isRecord(project.modules)) errors.push('domain_modules_required');
  const requiredModule = resolveCadDomainModule(project.domain);
  if (requiredModule && !isRecord(project.modules?.[requiredModule])) errors.push('domain_module_required:' + requiredModule);
  if (project.domain === 'architecture.building' && isRecord(project.modules?.architecture)) {
    const a = project.modules.architecture;
    if (!isRecord(a.site) || !Array.isArray(a.spaces) || !Array.isArray(a.openings)
        || !(Array.isArray(a.walls) || Array.isArray(a.wings)))
      errors.push('architecture_site_spaces_openings_and_massing_required');
  }
  for (const key of ['assets', 'views', 'sheets', 'scenes', 'productions', 'outputs', 'packages', 'receipts', 'revisions']) {
    if (!Array.isArray(project[key])) errors.push(key + '_array_required');
  }
  const assetIds = new Set();
  for (const asset of project.assets ?? []) {
    if (!isRecord(asset) || !isId(asset.id) || assetIds.has(asset.id)
        || !['reference', 'source', 'derived', 'published'].includes(asset.role))
      errors.push('invalid_asset_record');
    else assetIds.add(asset.id);
    if (asset?.status === 'available' && (!validUri(asset.uri) || !isSha(asset.sha256)))
      errors.push('available_asset_requires_uri_and_sha256:' + asset?.id);
  }
  const outputIds = new Set();
  for (const output of project.outputs ?? []) {
    if (!isRecord(output) || !isId(output.id) || outputIds.has(output.id)
        || !isId(output.capability) || !states.has(output.state)
        || !Array.isArray(output.dependencies)) errors.push('invalid_output_contract:' + output?.id);
    else outputIds.add(output.id);
    if (['generated', 'validated', 'approved'].includes(output?.state)
        && (!isRecord(output.artifact) || !validUri(output.artifact.uri)
            || !isSha(output.artifact.sha256) || !isId(output.receiptId)
            || output.sourceRevision !== project.revision
            || !(project.receipts ?? []).some(r => r?.id === output.receiptId
              && r.outputId === output.id && r.artifactSha256 === output.artifact?.sha256
              && r.sourceRevision === output.sourceRevision)))
      errors.push('unverified_generated_output:' + output?.id);
  }
  for (const output of project.outputs ?? []) {
    for (const id of output?.dependencies ?? []) if (!outputIds.has(id) || id === output.id)
      errors.push('invalid_output_dependency:' + output?.id);
  }
  // Detect cycles; do not promise a schedulable plan from a cyclic graph.
  const edges = new Map((project.outputs ?? []).map(o => [o.id, o.dependencies ?? []]));
  const visiting = new Set(), visited = new Set();
  const visit = id => {
    if (visiting.has(id)) { errors.push('cyclic_output_dependencies:' + id); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of edges.get(id) ?? []) if (edges.has(dep)) visit(dep);
    visiting.delete(id); visited.add(id);
  };
  for (const id of edges.keys()) visit(id);
  for (const pkg of project.packages ?? []) {
    if (!isId(pkg?.id) || !Array.isArray(pkg.outputIds) || pkg.outputIds.some(id => !outputIds.has(id)))
      errors.push('invalid_delivery_package:' + pkg?.id);
    if (pkg?.permitReady === true || pkg?.sealed === true)
      errors.push('unverified_legal_assertion:' + pkg?.id);
  }
  if (!Number.isSafeInteger(project.revision) || project.revision < 1) errors.push('revision_must_be_positive_integer');
  if (!isRecord(project.professionalReview) || project.professionalReview.permitReady !== false
      || project.professionalReview.sealed !== false) errors.push('professional_review_defaults_required');
  return { valid: errors.length === 0, errors };
}

export function requireCadProjectV2(project) {
  const result = validateCadProjectV2(project);
  if (!result.valid) throw new Error(result.errors.join('; '));
  return project;
}

export function createCadProjectV2({ id, name, domain, unit = 'in', revision = 1,
  geometry = { entities: [], relationships: [], constraints: [] }, modules = {},
  compatibility = null } = {}) {
  const project = {
    schema: CAD_PROJECT_V2, id, name, domain, revision,
    coordinateSystem: { unit, upAxis: 'Z', handedness: 'right', origin: [0, 0, 0] },
    geometry: structuredClone(geometry), modules: structuredClone(modules),
    intent: { references: [], decisions: [], assumptions: [] },
    assets: [], views: [], sheets: [], scenes: [], productions: [],
    outputs: [], packages: [], receipts: [], revisions: [],
    execution: { jobs: [], providerPreferences: [] },
    professionalReview: { permitReady: false, sealed: false, issues: [], reviews: [] },
    ...(compatibility ? { compatibility: structuredClone(compatibility) } : {}),
  };
  return requireCadProjectV2(project);
}

export function convertCadCoordinate(value, fromUnit, toUnit) {
  if (!CAD_UNITS.includes(fromUnit) || !CAD_UNITS.includes(toUnit)
      || typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('invalid_coordinate_conversion');
  return value / unitsPerInch[fromUnit] * unitsPerInch[toUnit];
}

/** Lossless editable-source adapter; original arrays remain reversible. */
export function normalizeCadV1(project) {
  requireValidProject(project);
  const entities = groupsV1.flatMap(group => project[group].map(item => ({
    id: item.id, kind: group === 'furniture' ? 'fixture' : group.slice(0, -1),
    sourceGroup: group, data: structuredClone(item),
  })));
  for (const item of project.parametricObjects ?? []) {
    entities.push({ id: item.id, kind: 'parametric', sourceGroup: 'parametricObjects', data: structuredClone(item) });
  }
  const unit = project.units === 'in' || project.units == null ? 'in' : project.units;
  if (unit !== 'in') throw new Error('v1_geometry_must_be_in_inches');
  return createCadProjectV2({
    id: project.id, name: project.name, domain: 'architecture.building', unit: 'in',
    geometry: { entities, relationships: [], constraints: [] },
    modules: { architecture: {
      site: {}, spaces: structuredClone(project.rooms), walls: structuredClone(project.walls),
      openings: structuredClone([...project.doors, ...project.windows]), roofs: [],
    } },
    compatibility: { sourceSchema: 'cad.project.v1', sourceDocument: structuredClone(project),
      sourceScale: 1, migration: 'lossless_editable_source' },
  });
}

export function restoreCadV1FromV2(project) {
  requireCadProjectV2(project);
  if (project.compatibility?.sourceSchema !== 'cad.project.v1'
      || !isRecord(project.compatibility.sourceDocument))
    throw new Error('not_a_v1_compatibility_project');
  const original = structuredClone(project.compatibility.sourceDocument);
  for (const group of [...groupsV1, 'parametricObjects']) {
    const updated = project.geometry.entities.filter(e => e.sourceGroup === group).map(e => structuredClone(e.data));
    if (group === 'parametricObjects' && !Array.isArray(original[group]) && updated.length === 0) continue;
    original[group] = updated;
  }
  requireValidProject(original);
  return original;
}

/** The locked DreamHouse source is an *architectural profile*, never the universal schema. */
export function normalizeArchitecturalSource(source) {
  if (!isRecord(source) || source.schema !== CAD_PROJECT_V2 || !isId(source.id)
      || !Array.isArray(source.rooms) || !Array.isArray(source.openings)
      || !Array.isArray(source.wings) || !isRecord(source.site))
    throw new Error('incompatible_architectural_source');
  const spaces = source.rooms.map(room => structuredClone(room));
  const entities = [];
  for (const [group, collection] of [['rooms', source.rooms], ['wings', source.wings],
    ['openings', source.openings], ['roofs', source.roofs ?? []],
    ['elements', source.elements ?? []]]) {
    for (const item of collection) if (isId(item?.id))
      entities.push({ id: group + ':' + item.id, kind: group, sourceGroup: group, data: structuredClone(item) });
  }
  return createCadProjectV2({
    id: source.id, name: source.name, domain: 'architecture.building',
    geometry: { entities, relationships: [], constraints: [] },
    modules: { architecture: { site: structuredClone(source.site),
      spaces, wings: structuredClone(source.wings), openings: structuredClone(source.openings),
      roofs: structuredClone(source.roofs ?? []), structure: structuredClone(source.structure ?? {}),
      ifcMap: structuredClone(source.ifcMap ?? {}) } },
    compatibility: { sourceSchema: 'cad.project.v2.architecture.sd02',
      sourceDocument: structuredClone(source), migration: 'non_destructive_profile_adapter' },
  });
}

/** A source revision change must never leave old media falsely marked current. */
export function invalidateCadOutputs(project, changedElementIds, nextRevision) {
  requireCadProjectV2(project);
  if (!Number.isSafeInteger(nextRevision) || nextRevision <= project.revision) throw new Error('next_revision_required');
  const changed = new Set(changedElementIds);
  const next = structuredClone(project);
  const affected = new Set();
  for (const output of next.outputs) {
    const deps = output.elementIds ?? [];
    if (changed.has('*') || deps.includes('*') || deps.some(id => changed.has(id)) || deps.length === 0) affected.add(output.id);
  }
  let previousSize;
  do {
    previousSize = affected.size;
    for (const output of next.outputs) if (output.dependencies.some(id => affected.has(id)))
      affected.add(output.id);
  } while (affected.size !== previousSize);
  for (const output of next.outputs) if (affected.has(output.id) && !['failed', 'blocked', 'planned'].includes(output.state))
    output.state = 'stale';
  next.revision = nextRevision;
  requireCadProjectV2(next);
  return { project: next, affectedOutputIds: [...affected] };
}

export function completeCadOutput(project, outputId, { artifact, receiptId, provider, providerVersion } = {}) {
  requireCadProjectV2(project);
  if (!validUri(artifact?.uri) || !isSha(artifact?.sha256)
      || !isId(receiptId) || !provider || !providerVersion)
    throw new Error('verified_artifact_and_executor_receipt_required');
  const next = structuredClone(project);
  const output = next.outputs.find(x => x.id === outputId);
  if (!output) throw new Error('unknown_output');
  if (output.dependencies.some(id => !['generated', 'validated', 'approved'].includes(next.outputs.find(x => x.id === id)?.state)))
    throw new Error('output_dependencies_not_complete');
  output.artifact = structuredClone(artifact);
  output.receiptId = receiptId;
  output.executor = { provider, version: providerVersion };
  output.sourceRevision = next.revision;
  output.state = 'generated';
  next.receipts.push({ id: receiptId, outputId, provider, providerVersion, sourceRevision: next.revision, artifactSha256: artifact.sha256 });
  requireCadProjectV2(next);
  return next;
}

/** Increment a model revision and invalidate all downstream artifacts atomically. */
export function updateCadGeometryEntity(project, id, updatedData, nextRevision) {
  requireCadProjectV2(project);
  const source = project.geometry.entities.find(e => e.id === id);
  if (!source || !isRecord(updatedData) || updatedData.id !== source.data?.id)
    throw new Error('cad_geometry_edit_requires_matching_source_identity');
  const next = structuredClone(project);
  const entity = next.geometry.entities.find(e => e.id === id);
  entity.data = structuredClone(updatedData);
  // Preserve reversibility of the legacy adapter and avoid stale architectural projection data.
  const restored = invalidateCadOutputs(next, [id], nextRevision);
  if (restored.project.compatibility?.sourceSchema === 'cad.project.v1') {
    const group = entity.sourceGroup;
    const original = restored.project.compatibility.sourceDocument[group] ?? [];
    const index = original.findIndex(e => e.id === updatedData.id);
    if (index < 0) throw new Error('cad_edit_source_link_missing');
    original[index] = structuredClone(updatedData);
    if (group === 'rooms') restored.project.modules.architecture.spaces = structuredClone(original);
    if (group === 'walls') restored.project.modules.architecture.walls = structuredClone(original);
    if (group === 'doors' || group === 'windows')
      restored.project.modules.architecture.openings = [
        ...restored.project.compatibility.sourceDocument.doors,
        ...restored.project.compatibility.sourceDocument.windows,
      ].map(x => structuredClone(x));
  }
  requireCadProjectV2(restored.project);
  return restored;
}
