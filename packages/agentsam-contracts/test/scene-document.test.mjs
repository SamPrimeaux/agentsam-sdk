import test from 'node:test';
import assert from 'node:assert/strict';
import {AGENTSAM_SCENE_DOCUMENT_CONTRACT, SCENE_DOCUMENT_OPERATIONS,
  assertSceneDocumentCapability,assertSceneDocumentOperationReceipt} from '../dist/scene-document.js';
import schema from '../schemas/scene-document.v2.schema.json' with {type:'json'};
import {Ajv2020} from 'ajv/dist/2020.js';

const capability=()=>{
  const operations=Object.fromEntries(SCENE_DOCUMENT_OPERATIONS.map(k=>[k,'unavailable']));
  for(const k of ['create','validate','migrate','edit']) operations[k]='implemented';
  return {contract:AGENTSAM_SCENE_DOCUMENT_CONTRACT,format:'iamscene',formatVersion:'2.0.0',
    schemaUri:'https://schemas.inneranimalmedia.com/packages/iamscene/v2/scene.canonical.schema.json',
    operations,requirements:[],limitations:['v2 rendering requires explicit host adapter']};
};
test('shared contract checks independent execution operations and matches JSON schema',()=>{
  const row=capability();
  const ajv=new Ajv2020({strict:false});
  const validate=ajv.compile(schema);
  assert.doesNotThrow(()=>assertSceneDocumentCapability(row));
  assert.equal(validate(row),true,JSON.stringify(validate.errors));
  assert.equal(row.operations.render,'unavailable');
  assert.throws(()=>assertSceneDocumentCapability({...row,operations:{create:'implemented'}}),/capability_invalid/);
});
test('operation receipts cannot claim lossless success after losses or successful unavailable execution',()=>{
  const receipt={contract:AGENTSAM_SCENE_DOCUMENT_CONTRACT,operation:'edit',status:'passed',
    preserved:['stable ID'],lost:[],warnings:[]};
  assert.doesNotThrow(()=>assertSceneDocumentOperationReceipt(receipt));
  assert.throws(()=>assertSceneDocumentOperationReceipt({...receipt,lost:['geometry']}),/receipt_invalid/);
  assert.throws(()=>assertSceneDocumentOperationReceipt({...receipt,status:'unavailable',outputHash:'a'.repeat(64)}),/receipt_invalid/);
});
