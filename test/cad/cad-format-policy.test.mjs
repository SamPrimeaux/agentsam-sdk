import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAD_SOURCE_FORMATS, identifyCadFileFormat, cadOutputFormatReference } from '../../src/lib/cad/format-policy.js';
import { CAD_DELIVERY_PROFILES, attachCadDeliveryProfiles, inspectCadDeliveryReadiness } from '../../src/lib/cad/delivery-profiles.js';
import { createCadProjectV2, validateCadProjectV2 } from '../../src/lib/cad/project-v2.js';

const catalog = JSON.parse(readFileSync(new URL('../../contracts/source-types.v2.json', import.meta.url)));
test('CAD format routing is a verified subset of the canonical source-types v2 catalog', () => {
  const identities = new Map(catalog.formats.map(f => [f.id, f]));
  const seen = new Set();
  for (const entry of CAD_SOURCE_FORMATS) {
    const canonical = identities.get(entry.id);
    assert.ok(canonical, entry.id + ' is absent from root source catalog');
    for (const ext of entry.extensions) {
      assert.ok(canonical.extensions.includes(ext), entry.id + ' does not own ' + ext);
      assert.ok(!seen.has(ext), ext + ' has multiple CAD routes');
      seen.add(ext);
      assert.equal(identifyCadFileFormat('/assets/TEST'+ext.toUpperCase()).id, entry.id);
    }
  }
  for (const [name, expected] of Object.entries({
    'house.ifc':'bim.ifc', 'scan.E57':'pointcloud.e57', 'door.stl':'model.stl',
    'sheet.svg':'image.svg', 'film.mov':'video.quicktime', 'model.3mf':'model.3mf',
    'site.ifczip':'bim.ifczip', 'scene.iamscene.json':'model.iamscene',
  })) assert.equal(identifyCadFileFormat(name).id, expected);
  assert.equal(identifyCadFileFormat('unknown.xyz.exe'), null);
  assert.equal(cadOutputFormatReference('mov').id, 'video.quicktime');
  assert.equal(cadOutputFormatReference('svg').id, 'image.svg');
});

test('every CAD delivery output declares a real canonical source identity', () => {
  const known = new Map(catalog.formats.map(f => [f.id, f]));
  for (const [profile, outputs] of Object.entries(CAD_DELIVERY_PROFILES)) {
    const kinds = new Set();
    for (const [kind, format, capability] of outputs) {
      assert.ok(!kinds.has(kind), profile + ' has duplicate kind ' + kind);
      kinds.add(kind);
      assert.match(capability, /^cad\./);
      const ref = cadOutputFormatReference(format);
      assert.ok(ref, profile + ' has unknown format ' + format);
      assert.ok(known.get(ref.id).extensions.includes(ref.extension));
    }
  }
  assert.ok(CAD_DELIVERY_PROFILES['mechanical.fabrication'].some(x => x[1] === 'stl'));
  assert.ok(CAD_DELIVERY_PROFILES['architecture.cinematic'].some(x => x[1] === 'mov'));
  assert.ok(CAD_DELIVERY_PROFILES['architecture.schematic'].some(x => x[1] === 'svg'));
});

test('profile outputs remain planned until provider receipts and validation', () => {
  const project = createCadProjectV2({id:'format-delivery',name:'Test',domain:'mechanical.part',
    modules:{mechanical:{components:[]}}});
  const attached = attachCadDeliveryProfiles(project, ['mechanical.fabrication']);
  assert.deepEqual(validateCadProjectV2(attached), {valid:true,errors:[]});
  assert.equal(attached.outputs.find(x=>x.format==='stl').formatRef.id,'model.stl');
  const pkg = attached.packages[0];
  assert.equal(inspectCadDeliveryReadiness(attached,pkg.id).readyForArtifactDelivery,false);
  const result = inspectCadDeliveryReadiness(attached,pkg.id);
  assert.equal(result.missingOutputIds.length,pkg.outputIds.length);
  assert.equal(result.pendingValidationOutputIds.length,0);
  attached.outputs[0].state='generated';
  attached.outputs[0].artifact={uri:'r2://cad/test.stp',sha256:'f'.repeat(64)};
  attached.outputs[0].receiptId='receipt_01';
  attached.receipts.push({id:'receipt_01',outputId:attached.outputs[0].id,sourceRevision:attached.revision,artifactSha256:'f'.repeat(64)});
  assert.equal(inspectCadDeliveryReadiness(attached,pkg.id).pendingValidationOutputIds.length,1);
  assert.equal(inspectCadDeliveryReadiness(attached,pkg.id).readyForArtifactDelivery,false);
});


test('CAD source references must resolve to canonical source-kind and format IDs', () => {
  const project = createCadProjectV2({id:'source-identity',name:'Source identity',domain:'mechanical.part',
    modules:{mechanical:{components:[]}}});
  project.assets.push({
    id:'source-file', role:'source',
    sourceKindRef:{catalog:'agentsam.source-types.v2',id:'filesystem.file'},
    formatRef:{catalog:'agentsam.source-types.v2',id:'model.stl',extension:'.stl'},
    formatDetection:{status:'identified',confidence:'high',evidence:['extension']},
  });
  assert.deepEqual(validateCadProjectV2(project), {valid:true,errors:[]});
  const unknownFormat = structuredClone(project);
  unknownFormat.assets[0].formatRef.id = 'model.not-in-catalog';
  assert.ok(validateCadProjectV2(unknownFormat).errors.includes('invalid_asset_format_ref:source-file'));
  const unknownKind = structuredClone(project);
  unknownKind.assets[0].sourceKindRef.id = 'filesystem.not-in-catalog';
  assert.ok(validateCadProjectV2(unknownKind).errors.includes('invalid_asset_source_kind_ref:source-file'));
  const unknownCandidate = structuredClone(project);
  unknownCandidate.assets[0].formatDetection = {
    status:'ambiguous', confidence:'low', evidence:['extension'],
    candidates:[{catalog:'agentsam.source-types.v2',id:'format.not-in-catalog'}],
  };
  assert.ok(validateCadProjectV2(unknownCandidate).errors.includes('invalid_asset_format_detection:source-file'));
});
