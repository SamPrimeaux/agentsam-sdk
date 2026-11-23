import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCadProjectV2, attachCadDeliveryProfiles } from '../../src/lib/cad/index.js';
import { cadIdForIfcGlobalId, projectFromIfcInspection } from '../../src/lib/cad/bim-bridge.js';
const guid = char => char.repeat(22);
const model = () => ({
  schema:'agentsam.bim.model.v1',
  source:{ifcSchema:'IFC4',sha256:'a'.repeat(64),byteLength:2848},
  project:{globalId:guid('P'),name:'Workshop',lengthUnit:'METRE',lengthScaleToM:1},
  spatial:{globalId:guid('S'),ifcClass:'IfcSite',name:'Plot',children:[
    {globalId:guid('B'),ifcClass:'IfcBuilding',name:'Workshop',children:[
      {globalId:guid('G'),ifcClass:'IfcBuildingStorey',name:'Ground',elevationM:0,children:[]}
    ]}
  ]},
  types:[{globalId:guid('T'),ifcClass:'IfcDoorType',name:'Overhead',predefinedType:null,psets:{}}],
  elements:[
    {globalId:guid('W'),ifcClass:'IfcWall',name:'South wall',predefinedType:null,typeId:null,containerId:guid('G'),psets:{},qtos:{},hostId:null,openingIds:[guid('O')],fillsOpeningId:null},
    {globalId:guid('O'),ifcClass:'IfcOpeningElement',name:'Opening',predefinedType:null,typeId:null,containerId:guid('G'),psets:{},qtos:{},hostId:guid('W'),openingIds:[],fillsOpeningId:null},
    {globalId:guid('D'),ifcClass:'IfcDoor',name:'Garage door',predefinedType:null,typeId:guid('T'),containerId:guid('G'),psets:{Pset_DoorCommon:{FireRating:null}},qtos:{},hostId:null,openingIds:[],fillsOpeningId:guid('O')},
  ],
  spaces:[{globalId:guid('R'),name:'Shop',longName:null,containerId:guid('G'),usage:'WORKSHOP',netFloorAreaM2:42.5,grossFloorAreaM2:45,heightM:3.4,hasGeometry:true}],
  counts:{IfcDoor:1,IfcWall:1},truncated:false,warnings:[],
});
test('IFC inspector data becomes a valid v2 semantic project without fabricating geometry', () => {
  const doc = model();
  const sourceUri = 'r2://cad/projects/workshop/model.ifc';
  const result = projectFromIfcInspection(doc,{id:'workshop_001',sourceUri,revision:3});
  assert.deepEqual(validateCadProjectV2(result), {valid:true,errors:[]});
  assert.equal(result.coordinateSystem.unit,'m');
  assert.equal(result.revision,3);
  assert.equal(result.assets[0].formatRef.id,'bim.ifc');
  assert.equal(result.assets[0].uri,sourceUri);
  assert.equal(result.assets[0].sha256,doc.source.sha256);
  assert.equal(result.modules.architecture.storeys.length,1);
  assert.equal(result.modules.architecture.spaces[0].netFloorAreaM2,42.5);
  assert.equal(result.modules.architecture.bim.semanticProjectionOnly,true);
  assert.equal(result.geometry.entities.find(e=>e.kind==='IfcDoor').data.fillsOpeningId,guid('O'));
  assert.ok(result.geometry.relationships.some(r=>r.kind==='fills'&&r.to===cadIdForIfcGlobalId(guid('O'))));
  assert.equal(result.outputs.length,0);
  assert.equal(result.packages.length,0);
  const withDeliverables=attachCadDeliveryProfiles(result,['architecture.bim-exchange']);
  assert.ok(withDeliverables.outputs.every(o=>o.state==='planned'));
  assert.equal(result.outputs.length,0);
});
test('IFC projection refuses truncated, unlinked or forged documents', () => {
  const input=model(); input.truncated=true;
  assert.throws(()=>projectFromIfcInspection(input,{id:'house_1',sourceUri:'r2://cad/house.ifc'}),/inspection_incomplete/);
  const bad=model();bad.elements[2].fillsOpeningId=guid('X');
  assert.throws(()=>projectFromIfcInspection(bad,{id:'house_1',sourceUri:'r2://cad/house.ifc'}),/fill_ref_unresolved/);
  assert.throws(()=>projectFromIfcInspection(model(),{id:'house_1',sourceUri:'javascript:alert(1)'}),/source_uri_required/);
});
test('IFC GlobalIds containing legal $ and _ remain distinct as CAD IDs',()=>{
  assert.notEqual(cadIdForIfcGlobalId(guid('$')),cadIdForIfcGlobalId(guid('_')));
  assert.match(cadIdForIfcGlobalId(guid('_')),/^[A-Za-z0-9][A-Za-z0-9_.:-]+$/);
});
