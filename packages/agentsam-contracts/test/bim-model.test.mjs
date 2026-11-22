import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { AGENTSAM_BIM_MODEL, assertBimModel } from '../dist/bim-model.js';

const schema = JSON.parse(readFileSync(new URL('../schemas/bim-model.v1.schema.json', import.meta.url)));
const validate = new Ajv2020({ strict: false }).compile(schema);
const id = (c) => c.repeat(22);

function model() {
  return {
    schema: AGENTSAM_BIM_MODEL,
    source: { ifcSchema: 'IFC4', sha256: 'a'.repeat(64), byteLength: 10 },
    project: { globalId: id('P'), name: 'Shop', lengthUnit: 'METRE', lengthScaleToM: 1 },
    spatial: { globalId: id('S'), ifcClass: 'IfcSite', name: 'Site', children: [
      { globalId: id('B'), ifcClass: 'IfcBuilding', name: 'Shop', children: [
        { globalId: id('G'), ifcClass: 'IfcBuildingStorey', name: 'Ground', elevationM: 0, children: [] }] }] },
    types: [{ globalId: id('T'), ifcClass: 'IfcDoorType', name: 'Overhead', predefinedType: null, psets: {} }],
    elements: [
      { globalId: id('W'), ifcClass: 'IfcWall', name: 'South wall', predefinedType: null, typeId: null, containerId: id('G'),
        psets: {}, qtos: {}, hostId: null, openingIds: [id('O')], fillsOpeningId: null },
      { globalId: id('O'), ifcClass: 'IfcOpeningElement', name: 'Door opening', predefinedType: null, typeId: null, containerId: id('G'),
        psets: {}, qtos: {}, hostId: id('W'), openingIds: [], fillsOpeningId: null },
      { globalId: id('D'), ifcClass: 'IfcDoor', name: 'Garage door', predefinedType: null, typeId: id('T'), containerId: id('G'),
        psets: { Pset_DoorCommon: { FireRating: null } }, qtos: {}, hostId: null, openingIds: [], fillsOpeningId: id('O') }],
    spaces: [{ globalId: id('R'), name: 'Shop', longName: null, containerId: id('G'), usage: null,
      netFloorAreaM2: 42.5, grossFloorAreaM2: 45, heightM: 3.4, hasGeometry: true }],
    counts: { IfcWall: 1, IfcDoor: 1 }, truncated: false, warnings: [],
  };
}

test('BimModel: a wall -> opening -> door chain validates by schema and by reference', () => {
  assert.equal(AGENTSAM_BIM_MODEL, 'agentsam.bim.model.v1');
  const m = model();
  assert.equal(validate(m), true, JSON.stringify(validate.errors));
  assert.doesNotThrow(() => assertBimModel(m));
});

test('BimModel: broken references and duplicate GlobalIds are rejected', () => {
  const cases = {
    agentsam_bim_model_fill_ref_unresolved: m => { m.elements[2].fillsOpeningId = id('X'); },
    agentsam_bim_model_host_ref_unresolved: m => { m.elements[1].hostId = id('X'); },
    agentsam_bim_model_opening_ref_unresolved: m => { m.elements[0].openingIds = [id('X')]; },
    agentsam_bim_model_type_ref_unresolved: m => { m.elements[2].typeId = id('X'); },
    agentsam_bim_model_container_ref_unresolved: m => { m.elements[0].containerId = id('X'); },
    agentsam_bim_model_space_container_unresolved: m => { m.spaces[0].containerId = id('X'); },
    agentsam_bim_model_global_id_duplicate: m => { m.elements[1].globalId = m.elements[0].globalId; },
    agentsam_bim_model_global_id_invalid: m => { m.elements[0].globalId = 'short'; },
    agentsam_bim_model_schema_tag: m => { m.schema = 'agentsam.bim.model.v0'; },
  };
  for (const [code, mutate] of Object.entries(cases)) {
    const m = model();
    mutate(m);
    assert.throws(() => assertBimModel(m), new RegExp(code), code);
  }
});

test('BimModel schema rejects undeclared fields and bad shapes', () => {
  const extra = model(); extra.surprise = true;
  assert.equal(validate(extra), false);
  const badClass = model(); badClass.elements[0].ifcClass = 'wall';
  assert.equal(validate(badClass), false);
  const badHash = model(); badHash.source.sha256 = 'nope';
  assert.equal(validate(badHash), false);
});
