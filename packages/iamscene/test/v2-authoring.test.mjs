import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  IAMSCENE_V2_CREATE_OBJECTS, IAMSCENE_V2_OBJECT_KINDS,
  describeSceneV2ObjectSupport, createSceneDocument, createSceneV2Document,
  createSceneV2Editor, migrateSceneV1ToV2, validateSceneV2Document,
  parseSceneV2Document, serializeSceneV2Document,
} from '../dist/src/index.js';

test('33 creation kinds remain separate from Templates and from executable renderer claims', () => {
  assert.equal(IAMSCENE_V2_CREATE_OBJECTS.length,33);
  assert.equal(new Set(IAMSCENE_V2_CREATE_OBJECTS.map(item=>item.kind)).size,33);
  assert.ok(IAMSCENE_V2_OBJECT_KINDS.includes('mesh'));
  assert.ok(!IAMSCENE_V2_OBJECT_KINDS.includes('templates'));
  const emitter=describeSceneV2ObjectSupport('particle-emitter');
  assert.equal(emitter.registered,true);
  assert.deepEqual(Object.values(emitter.operations),Array(4).fill('unavailable'));
  const renderer=describeSceneV2ObjectSupport('sphere',[{kind:'sphere',render:()=>{}}]);
  assert.equal(renderer.operations.render,'implemented');
  assert.equal(renderer.operations.create,'unavailable');
});

test('v2 canonical serialization, multi-scene graph and independent systems round-trip exactly', () => {
  const source=createSceneV2Document({id:'house',name:'DreamHouse',now:'2026-11-21T00:00:00.000Z'});
  source.scenes.push({id:'scene-floor-2',name:'Upstairs',rootObjectIds:['second-floor'],frameRef:'frame-mobile'});
  source.objects.push({id:'second-floor',sceneId:'scene-floor-2',name:'Second Floor',kind:'group',transform:{},visible:true});
  source.systems.frames.push({id:'frame-mobile',mode:'preset',preset:'iPhone-13-Pro',width:390,height:844,autoZoom:false});
  source.systems.skies.push({id:'sky-01',mode:'physical',intensity:1,showBackground:true});
  source.systems.fogs.push({id:'fog-01',mode:'height',color:'#eeeeee',heightDensity:.02});
  source.systems.environments[0].skyRef='sky-01';
  source.systems.environments[0].fogRef='fog-01';
  source.systems.simulations.push({id:'physics',enabled:false,gravity:[0,-9.81,0]});
  source.scenes[0].simulationRef='physics';
  source.systems.effects.push({id:'bloom',kind:'bloom',enabled:true,intensity:.3});
  source.scenes[0].effectIds=['bloom'];
  source.behaviors.variables.push({id:'counter',name:'Count',type:'counter',value:0});
  source.behaviors.events.push({id:'startup',trigger:'start',actions:[{type:'set-variable',variableId:'counter'}]});
  assert.deepEqual(parseSceneV2Document(serializeSceneV2Document(source)),source);
});

test('v2 authoring preserves object IDs, geometry independence and undo/redo', () => {
  const doc=createSceneV2Document({id:'scene',name:'Scene'});
  const editor=createSceneV2Editor(doc);
  editor.upsertGeometry({id:'geometry-box',kind:'primitive',primitiveType:'cube',parameters:{width:2,height:2,depth:2}});
  editor.upsertGeometry({id:'geometry-sphere',kind:'primitive',primitiveType:'sphere',parameters:{radius:1}});
  editor.addObject({id:'thing',sceneId:'scene-main',parentId:'scene-root',name:'Box',kind:'cube',transform:{position:[1,2,3]},visible:true,geometryRef:'geometry-box'});
  const first=editor.document.objects.find(row=>row.id==='thing');
  editor.setObjectGeometry('thing','geometry-sphere');
  assert.deepEqual(editor.document.objects.find(row=>row.id==='thing').transform,first.transform);
  assert.equal(editor.document.objects.find(row=>row.id==='thing').geometryRef,'geometry-sphere');
  editor.undo();
  assert.equal(editor.document.objects.find(row=>row.id==='thing').geometryRef,'geometry-box');
  editor.redo();
  assert.equal(editor.document.objects.find(row=>row.id==='thing').geometryRef,'geometry-sphere');
  assert.equal(editor.document.objects.find(row=>row.id==='thing').id,'thing');
  assert.equal(editor.document.resources.geometry.length,2);
  assert.throws(()=>editor.patchObject('thing',{id:'changed'}),/entity_id_immutable/);
  assert.throws(()=>editor.patchObject('thing',{sceneId:'other-scene'}),/entity_id_immutable/);
  assert.throws(()=>editor.patchScene('scene-main',{id:'renamed'}),/entity_id_immutable/);
  assert.throws(()=>editor.setObjectGeometry('thing','missing'),/unknown_reference/);
  assert.equal(editor.document.objects.find(row=>row.id==='thing').geometryRef,'geometry-sphere');
});

test('scene object and system edits stay independently addressable, enforce references, and undo', () => {
  const editor=createSceneV2Editor(createSceneV2Document({id:'world',name:'World'}));
  editor.addPrimitive({id:'cube',sceneId:'scene-main',parentId:'scene-root',kind:'cube',parameters:{width:2,height:3,depth:4}});
  const object=editor.document.objects.find(x=>x.id==='cube');
  assert.equal(object.geometryRef,'geometry:cube');
  assert.equal(editor.document.resources.geometry.find(x=>x.id==='geometry:cube').primitiveType,'cube');
  const before=editor.document.objects.length;
  editor.reparentObject('cube',null);
  assert.equal(editor.document.objects.length,before);
  assert.ok(editor.document.scenes[0].rootObjectIds.includes('cube'));
  editor.reparentObject('cube','scene-root');
  assert.ok(!editor.document.scenes[0].rootObjectIds.includes('cube'));
  editor.patchSystem('cameras','camera-main',{fov:48});
  assert.equal(editor.document.systems.cameras[0].fov,48);
  assert.equal(editor.document.systems.environments[0].ambientIntensity,.3);
  editor.patchSystem('environments','environment-main',{ambientIntensity:.75});
  assert.equal(editor.document.systems.environments[0].ambientIntensity,.75);
  editor.undo();
  assert.equal(editor.document.systems.environments[0].ambientIntensity,.3);
  assert.equal(editor.document.systems.cameras[0].fov,48);
  assert.throws(()=>editor.patchSystem('environments','environment-main',{skyRef:'not-installed'}),/unknown_reference/);
  assert.equal(editor.document.systems.environments[0].skyRef,undefined);
  assert.throws(()=>editor.reparentObject('scene-root','cube'),/scene_graph_cycle/);
  assert.throws(()=>editor.removeObject('scene-root'),/remove_has_children/);
  editor.removeObject('cube');
  assert.equal(editor.document.objects.some(x=>x.id==='cube'),false);
  // Deleting an instance does not erase its reusable geometry resource.
  assert.ok(editor.document.resources.geometry.some(x=>x.id==='geometry:cube'));
});

test('v2 rejects dangling references, cross-scene parenting, unknown executables and cycles', () => {
  const source=createSceneV2Document({id:'scene',name:'Scene'});
  const clone=()=>structuredClone(source);
  const unknown=clone();unknown.objects[0].geometryRef='missing';
  assert.equal(validateSceneV2Document(unknown).valid,false);
  const cross=clone();
  cross.scenes.push({id:'scene-two',name:'Two',rootObjectIds:[]});
  cross.objects.push({id:'other',sceneId:'scene-two',parentId:'scene-root',name:'Other',kind:'cube',transform:{},visible:true});
  assert.ok(validateSceneV2Document(cross).errors.some(error=>error.message==='cross_scene_parent'));
  const cycle=clone();cycle.objects[0].parentId='scene-root';cycle.scenes[0].rootObjectIds=[];
  assert.ok(validateSceneV2Document(cycle).errors.some(error=>error.message==='scene_graph_cycle'));
  const unsupported=clone();unsupported.objects[0].kind='execute-javascript';
  assert.equal(validateSceneV2Document(unsupported).valid,false);
  const secrets=clone();secrets.behaviors.dataSources.push({id:'api',kind:'api',apiToken:'secret'});
  assert.equal(validateSceneV2Document(secrets).valid,false);
});

test('v1 migration preserves geometry source, material, animation and interaction identities', () => {
  const v1=createSceneDocument({id:'circuit',name:'Circuit'});
  v1.scene.nodes.push({id:'path-01',name:'Signal path',kind:'path',parentId:'scene-root',
    transform:{position:[1,2,3]},visible:true,
    geometry:{type:'polyline',points:[[0,0,0],[2,1,0]],radius:.03}});
  v1.scene.nodes.push({id:'pulse-01',name:'Pulse',kind:'pulse',parentId:'scene-root',
    transform:{},visible:true,pathRef:'path-01',geometry:{type:'sphere',radius:.2}});
  v1.materials.push({id:'glow',baseColor:'#abcdef',roughness:.3});
  v1.scene.nodes[1].materialRef='glow';
  v1.animations.push({id:'move',name:'Move',duration:2,loop:true,tracks:[{id:'p',targetId:'pulse-01',property:'transform.position',keyframes:[{time:0,value:[0,0,0]},{time:2,value:[2,0,0]}]}]});
  v1.interactions.push({id:'hover',targetId:'pulse-01',event:'pointerenter',action:{type:'playAnimation',animationId:'move'}});
  v1.environment.fog={color:'#cccccc',near:.1,far:100};
  const original=structuredClone(v1);
  const v2=migrateSceneV1ToV2(v1);
  assert.deepEqual(v1,original);
  assert.equal(v2.objects.find(x=>x.id==='pulse-01').pathRef,'path-01');
  assert.deepEqual(v2.resources.geometry.find(x=>x.id==='geometry:path-01').legacyDefinition,v1.scene.nodes[1].geometry);
  assert.equal(v2.resources.materials[0].id,'glow');
  assert.deepEqual(v2.behaviors.animations,v1.animations);
  assert.equal(v2.behaviors.events[0].actions[0].animationId,'move');
  assert.equal(v2.systems.fogs[0].near,.1);
  assert.deepEqual(parseSceneV2Document(serializeSceneV2Document(v2)),v2);
});

test('CLI creates and validates versioned v2 documents without reinterpreting v1', () => {
  const dir=mkdtempSync(path.join(os.tmpdir(),'iam-scene-v2-'));
  try {
    const cli=new URL('../bin/iamscene.mjs',import.meta.url).pathname;
    const output=path.join(dir,'v2.iamscene.json');
    const init=execFileSync(process.execPath,[cli,'init',output,'--name','My Scene','--format-version','2'],{encoding:'utf8'});
    assert.match(init,/Created/);
    const doc=JSON.parse(readFileSync(output,'utf8'));
    assert.equal(doc.formatVersion,'2.0.0');
    const validation=JSON.parse(execFileSync(process.execPath,[cli,'validate',output],{encoding:'utf8'}));
    assert.equal(validation.valid,true);
    assert.equal(validation.sceneCount,1);
    const inspection=JSON.parse(execFileSync(process.execPath,[cli,'inspect',output],{encoding:'utf8'}));
    assert.equal(inspection.formatVersion,'2.0.0');
    assert.equal(inspection.runtimeSupport,'not-verified');
    const old=createSceneDocument({id:'legacy',name:'Legacy'});
    const oldfile=path.join(dir,'old.iamscene.json');
    writeFileSync(oldfile,JSON.stringify(old));
    const migrated=path.join(dir,'migrated.iamscene.json');
    execFileSync(process.execPath,[cli,'migrate-v2',oldfile,'--out',migrated]);
    assert.equal(JSON.parse(readFileSync(migrated,'utf8')).formatVersion,'2.0.0');
    assert.equal(JSON.parse(readFileSync(oldfile,'utf8')).formatVersion,'1.0.0');
    const duplicate=spawnSync(process.execPath,[cli,'migrate-v2',oldfile,'--out',migrated],{encoding:'utf8'});
    assert.notEqual(duplicate.status,0);
    assert.ok(existsSync(migrated));
  } finally {rmSync(dir,{recursive:true,force:true});}
});
