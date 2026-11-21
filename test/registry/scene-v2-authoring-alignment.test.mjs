import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Ajv2020} from 'ajv/dist/2020.js';
import {getCapabilityManifest} from '../../src/capabilities/manifest.js';
import {createRegistry} from '../../src/registry/index.js';
import {SCENE_DOCUMENT_OPERATIONS,AGENTSAM_SCENE_DOCUMENT_CONTRACT,
  assertSceneDocumentCapability} from '../../packages/agentsam-contracts/dist/scene-document.js';
import {
  IAMSCENE_V2_CREATE_OBJECTS,
  IAMSCENE_V2_SCHEMA_URI,
  createSceneV2Document,createSceneV2Editor,validateSceneV2Document,
  migrateSceneV1ToV2,describeSceneV2ObjectSupport,
} from '../../packages/iamscene/dist/src/index.js';

const json=p=>JSON.parse(readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
test('v2 root APIs are version-correct package APIs, never fictitious hosted handlers',()=>{
 const manifest=getCapabilityManifest();
 const exports={
  'iamscene.v2.create':createSceneV2Document,
  'iamscene.v2.validate':validateSceneV2Document,
  'iamscene.v2.migrate':migrateSceneV1ToV2,
  'iamscene.v2.edit':createSceneV2Editor,
 };
 const registry=createRegistry();
 for(const [id,fn] of Object.entries(exports)){
   const row=manifest.capabilities[id];
   assert.equal(row?.api_only,true,id);
   assert.equal(row?.contract,AGENTSAM_SCENE_DOCUMENT_CONTRACT,id);
   assert.equal(row.package,'@inneranimalmedia/iamscene');
   assert.equal(row.status,'experimental');
   assert.equal(typeof fn,'function');
   assert.equal(registry.status(id).agent_callable,false);
 }
 assert.ok(!manifest.capabilities['iamscene.v2.render']);
 assert.ok(!manifest.capabilities['iamscene.v2.simulate']);
});
test('v2 schemas, object-vocabulary, root package manifest and losses stay grounded',()=>{
 const v1=json('packages/iamscene/schema/iamscene.v1.schema.json');
 const v2=json('packages/iamscene/schema/iamscene.v2.schema.json');
 const descriptor=json('packages/agentsam-contracts/schemas/scene-document.v2.schema.json');
 const pkg=json('packages/iamscene/agentsam.package.json');
 const catalog=json('packages/catalog/generated/packages.json');
 const ajv=new Ajv2020({allErrors:true,strict:false,validateFormats:false});
 ajv.addSchema(v1);
 const validate=ajv.compile(v2);
 const document=createSceneV2Document({id:'verify',name:'Verify'});
 assert.equal(validate(document),true,JSON.stringify(validate.errors));
 assert.equal(v2.$id,IAMSCENE_V2_SCHEMA_URI);
 const kinds=new Set(v2.properties.objects.items.properties.kind.enum);
 assert.equal(IAMSCENE_V2_CREATE_OBJECTS.length,33);
 for(const kind of IAMSCENE_V2_CREATE_OBJECTS)assert.ok(kinds.has(kind.kind),kind.kind);
 const versions=pkg.scene_document_versions;
 assert.deepEqual(versions.map(v=>v.formatVersion),['1.0.0','2.0.0']);
 assert.equal(versions[1].renderer,'unavailable');
 assert.equal(catalog.packages.find(p=>p.id==='iamscene').scene_document_versions[1].status,'experimental');
 assert.equal(descriptor.properties.contract.const,AGENTSAM_SCENE_DOCUMENT_CONTRACT);
 assert.equal(SCENE_DOCUMENT_OPERATIONS.length,8);
 assertSceneDocumentCapability({
   contract:AGENTSAM_SCENE_DOCUMENT_CONTRACT,format:'iamscene',formatVersion:'2.0.0',
   schemaUri:IAMSCENE_V2_SCHEMA_URI,operations:Object.fromEntries(SCENE_DOCUMENT_OPERATIONS.map(op=>[op,['create','validate','migrate','edit'].includes(op)?'implemented':'unavailable'])),
   requirements:[],limitations:['v2 renderer unavailable'],
 });
 assert.equal(describeSceneV2ObjectSupport('particle-emitter').operations.render,'unavailable');
});
