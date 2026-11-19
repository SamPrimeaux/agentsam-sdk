import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  createCadProjectV2, validateCadProjectV2, normalizeCadV1, restoreCadV1FromV2,
  normalizeArchitecturalSource, updateCadGeometryEntity, completeCadOutput,
  convertCadCoordinate, invalidateCadOutputs,
} from '../../src/lib/cad/project-v2.js';
import {
  attachCadDeliveryProfiles, inspectCadDeliveryReadiness, CAD_DELIVERY_PROFILES,
} from '../../src/lib/cad/delivery-profiles.js';
import { createCadProductionOperations } from '../../src/lib/cad/production-operations.js';
import { createCadOperations } from '../../src/sam/packs/cad/index.js';

const json = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const sourceTypesSchema = json(new URL('../../contracts/source-types.v2.schema.json', import.meta.url));
const sourceTypesCatalog = json(new URL('../../contracts/source-types.v2.json', import.meta.url));
const sourceTypesV1 = json(new URL('../../contracts/source-types.v1.json', import.meta.url));
const schema = json(new URL('../../protocol/cad/cad.project.v2.schema.json', import.meta.url));
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validateSourceTypes = ajv.compile(sourceTypesSchema);
const validateSchema = ajv.compile(schema);
const sameSchema = doc => {
  assert.equal(validateSchema(doc), true, JSON.stringify(validateSchema.errors));
  assert.deepEqual(validateCadProjectV2(doc), { valid: true, errors: [] });
};


test('root source-types v2 catalog validates, covers broad format families and preserves V1 identifiers', () => {
  assert.equal(validateSourceTypes(sourceTypesCatalog), true, JSON.stringify(validateSourceTypes.errors));
  assert.ok(sourceTypesCatalog.formats.length >= 180, 'catalog should cover more than a language-only list');
  const ids = new Set(sourceTypesCatalog.formats.map(x => x.id));
  assert.equal(ids.size, sourceTypesCatalog.formats.length, 'format IDs must be unique');
  const familyIds = new Set(sourceTypesCatalog.families.map(x => x.id));
  for (const format of sourceTypesCatalog.formats) {
    assert.ok(familyIds.has(format.family), 'unknown family for ' + format.id);
    for (const related of [...(format.codecs || []), ...(format.containerFormats || [])])
      assert.ok(ids.has(related), 'unknown related format ' + related);
  }
  const extensionIds = new Map();
  for (const format of sourceTypesCatalog.formats) for (const extension of format.extensions) {
    const found = extensionIds.get(extension) || [];
    found.push(format.id);
    extensionIds.set(extension, found);
  }
  const ambiguityMap = new Map(sourceTypesCatalog.ambiguities.map(x => [x.extension, x.formatIds]));
  for (const [extension, formatIds] of extensionIds) {
    if (formatIds.length > 1) {
      assert.ok(ambiguityMap.has(extension), 'unregistered extension ambiguity: ' + extension);
      assert.deepEqual([...ambiguityMap.get(extension)].sort(), [...new Set(formatIds)].sort());
    }
  }
  const legacy = sourceTypesCatalog.compatibility.legacyIdMappings;
  for (const type of sourceTypesV1.types) assert.ok(legacy[type.id]?.length, 'missing V1 mapping: ' + type.id);
  for (const id of ['cad.step','bim.ifc','cam.gcode','model.glb','video.mp4','audio.wav','image.exr','pointcloud.e57','science.dicom'])
    assert.ok(ids.has(id), 'missing expected format ' + id);
  assert.ok(ambiguityMap.has('.stl'));
  assert.ok(ambiguityMap.has('.ts'));
  assert.ok(ambiguityMap.has('.nc'));
});

test('CAD assets and outputs use shared format references without breaking legacy format labels', () => {
  const project = createCadProjectV2({
    id: 'format_ref_project', name: 'Format reference project', domain: 'mechanical.part',
    modules: { mechanical: { components: [] } },
  });
  const stepRef = { catalog: 'agentsam.source-types.v2', id: 'cad.step', extension: '.step' };
  project.assets.push({
    id: 'source_step', role: 'source', uri: 'r2://cad/source.step', sha256: 'a'.repeat(64),
    status: 'available', mediaType: 'application/step',
    sourceKindRef: { catalog: 'agentsam.source-types.v2', id: 'filesystem.file' },
    formatRef: stepRef,
    formatDetection: { status: 'identified', confidence: 'high', evidence: ['extension','signature'], candidates: [stepRef] },
  });
  project.outputs.push({
    id: 'ifc_export', kind: 'exchange', format: 'ifc', formatRef: { catalog: 'agentsam.source-types.v2', id: 'bim.ifc', extension: '.ifc' },
    capability: 'cad.model.export', state: 'planned', sourceRevision: 1, dependencies: [],
  });
  sameSchema(project);
  assert.deepEqual(validateCadProjectV2(project), { valid: true, errors: [] });

  const ambiguous = structuredClone(project);
  ambiguous.assets.push({
    id: 'ambiguous_stl', role: 'reference',
    formatDetection: {
      status: 'ambiguous', confidence: 'medium', evidence: ['extension'],
      candidates: [
        { catalog: 'agentsam.source-types.v2', id: 'model.stl', extension: '.stl' },
        { catalog: 'agentsam.source-types.v2', id: 'subtitle.ebu-stl', extension: '.stl' },
      ],
    },
  });
  sameSchema(ambiguous);

  const invalid = structuredClone(project);
  invalid.assets[0].formatRef.catalog = 'agentsam.source-types.v1';
  assert.equal(validateSchema(invalid), false);
  assert.ok(validateCadProjectV2(invalid).errors.includes('invalid_asset_format_ref:source_step'));
});
\ntest('portable v2 validates domain profiles without requiring architectural fields', () => {
  const part = createCadProjectV2({
    id: 'bushing_001', name: 'Bushing', domain: 'mechanical.part', unit: 'mm',
    geometry: { entities: [{ id: 'solid_A', kind: 'solid', data: { diameter: 18, length: 24 } }],
      relationships: [], constraints: [] },
    modules: { mechanical: { components: ['solid_A'], tolerances: [] } },
  });
  sameSchema(part);
  assert.equal(convertCadCoordinate(1, 'in', 'mm'), 25.4);
  assert.equal(convertCadCoordinate(25.4, 'mm', 'in'), 1);
  assert.throws(() => attachCadDeliveryProfiles(part, ['architecture.schematic']), /domain_mismatch/);
  const fabrication = attachCadDeliveryProfiles(part, ['mechanical.fabrication']);
  sameSchema(fabrication);
  assert.equal(fabrication.outputs.length, 4);
});

test('legacy V1 fixture maps losslessly to a model with stable editable IDs and back', () => {
  const source = json(new URL('../fixtures/cad/courtyard-house.json', import.meta.url));
  const migrated = normalizeCadV1(source);
  sameSchema(migrated);
  assert.deepEqual(restoreCadV1FromV2(migrated), source);
  const wallId = source.walls[0].id;
  const newWall = { ...source.walls[0], height3D: source.walls[0].height3D + 12 };
  const edit = updateCadGeometryEntity(migrated, wallId, newWall, 2);
  sameSchema(edit.project);
  assert.equal(restoreCadV1FromV2(edit.project).walls[0].height3D, newWall.height3D);
  assert.equal(source.walls[0].height3D, newWall.height3D - 12);
});

test('architecture SD-02 profile is additive and does not alter its locked source document', () => {
  const source = {
    schema: 'cad.project.v2', id: 'dream_house_sd02', name: 'DreamHouse study',
    revision: 'SD-02-RC1', lock: { designHash: 'locked-source-placeholder' },
    rooms: [{ id: 'gym', name: 'Gym' }], wings: [{ id: 'wing_01', name: 'West' }],
    openings: [{ id: 'D-01', type: 'door' }], roofs: [{ id: 'roof-main' }],
    elements: [{ id: 'stone_1' }], site: { parcel: {} }, structure: {}, ifcMap: {},
  };
  const snapshot = structuredClone(source);
  const v2 = normalizeArchitecturalSource(source);
  sameSchema(v2);
  assert.deepEqual(source, snapshot);
  assert.deepEqual(v2.compatibility.sourceDocument, snapshot);
  assert.equal(v2.modules.architecture.spaces.length, 1);
  assert.ok(v2.geometry.entities.some(e => e.id === 'wings:wing_01'));
});

test('SD/CD, imagery, interactive, film and handoff are output intents, not fictitious deliverables', () => {
  const source = json(new URL('../fixtures/cad/courtyard-house.json', import.meta.url));
  const migrated = normalizeCadV1(source);
  const profiles = ['architecture.concept', 'architecture.schematic',
    'architecture.cd-preparation', 'architecture.interactive',
    'architecture.cinematic', 'architecture.professional-handoff'];
  const staged = attachCadDeliveryProfiles(migrated, profiles);
  sameSchema(staged);
  assert.equal(staged.packages.length, 6);
  const doc = staged.packages.find(x => x.profile === 'architecture.cd-preparation');
  assert.equal(doc.permitReady, false);
  assert.equal(doc.sealed, false);
  assert.ok(doc.outputIds.some(id => id.includes('M-HVAC')));
  assert.ok(staged.outputs.some(x => x.format === 'mp4'));
  assert.ok(staged.outputs.some(x => x.format === 'ifc'));
  const ready = inspectCadDeliveryReadiness(staged, doc.id);
  assert.equal(ready.readyForArtifactDelivery, false);
  assert.equal(ready.missingOutputIds.length, CAD_DELIVERY_PROFILES['architecture.cd-preparation'].length);
  assert.throws(() => completeCadOutput(staged, staged.outputs[0].id, {artifact: {uri: 'r2://x', sha256: 'x'}}), /verified_artifact/);
  const generated = completeCadOutput(staged, staged.outputs[0].id, {
    artifact: {uri: 'r2://cad/projects/x/image.png',sha256:'a'.repeat(64),formatRef:{catalog:'agentsam.source-types.v2',id:'image.png',extension:'.png'}},
    receiptId:'samr_approved1',provider:'blender',providerVersion:'5.0.1',
  });
  sameSchema(generated);
  assert.equal(generated.outputs[0].artifact.formatRef.id, 'image.png');
  const stale = invalidateCadOutputs(generated, ['walls:wall-0'], 2);
  assert.equal(stale.project.outputs[0].state, 'stale');
  sameSchema(stale.project);
});

test('dependencies are validated and cyclic outputs cannot be scheduled', () => {
  const source = normalizeCadV1(json(new URL('../fixtures/cad/courtyard-house.json', import.meta.url)));
  const project = attachCadDeliveryProfiles(source, ['architecture.interactive']);
  project.outputs[0].dependencies = [project.outputs[1].id];
  project.outputs[1].dependencies = [project.outputs[0].id];
  assert.ok(validateCadProjectV2(project).errors.some(x => x.startsWith('cyclic_output')));
});

test('SAM production operations are registered only when host port explicitly authorizes support', async () => {
  assert.throws(() => createCadProductionOperations(), /authorized_provider_required/);
  const calls = [];
  const principal = { accountId: 'account_a', actorId: 'actor_a', tenantId: 'tenant_a' };
  const port = {
    supportedOperationIds: ['cad.presentation.render'],
    provider: {execute: async (operation, input) => {
      calls.push({operation, input});
      return {ok:true,operation,artifact:{uri:'r2://cad/test/image.png',sha256:'b'.repeat(64)},
        receiptId:'samr_123',executor:{name:'blender',version:'5.0.1'}};
    }},
    resolveTrustedContext: async () => principal,
    authorize: async () => true,
    requestApproval: async () => true,
  };
  const ops = createCadProductionOperations(port);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].id, 'cad.presentation.render');
  const out = await ops[0].handler({project_id:'p',revision:1,output_id:'o'});
  assert.equal(out.receiptId,'samr_123');
  assert.equal(calls.length,1);
  assert.equal(createCadOperations({production:port, ...port}).length, 1);
  const denied = createCadProductionOperations({...port, requestApproval:async()=>false});
  await assert.rejects(() => denied[0].handler({project_id:'p',revision:1,output_id:'o'}), /approval_required/);
});
