import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENTSAM_SCENE_FORMAT_CONTRACT,
  SCENE_FORMAT_OPERATIONS,
  assertSceneFormatCapability,
  assertSceneFormatRoundTripReceipt,
  assertSceneFormatReferenceReceipt,
} from '../dist/scene-format.js';

const base = {
  id: 'glb', family: 'gltf', extensions: ['.glb'],
  operations: { import: 'implemented', export: 'implemented', 'live-reference': 'implemented', 'round-trip': 'implemented' },
  limitations: ['Some glTF extension payloads are retained but not editable'],
};

test('shared contract exposes four independent operations, never inferred from display support', () => {
  assert.equal(AGENTSAM_SCENE_FORMAT_CONTRACT, 'agentsam.scene-format.v1');
  assert.deepEqual(SCENE_FORMAT_OPERATIONS, ['import', 'export', 'live-reference', 'round-trip']);
  assert.doesNotThrow(() => assertSceneFormatCapability(base));
  assert.doesNotThrow(() => assertSceneFormatCapability({...base, operations:{...base.operations, import:'unavailable'}}));
  assert.throws(() => assertSceneFormatCapability({...base, operations:{'live-reference':'implemented'}}), /operations_invalid/);
  assert.throws(() => assertSceneFormatCapability({...base, extensions:['glb']}), /capability_invalid/);
});

test('round trip receipt disallows claiming successful lossless preservation while reporting lost fields', () => {
  const valid = {format:'glb', passed:true, preserved:['mesh hierarchy'],lost:[],warnings:['skins remain opaque']};
  assert.doesNotThrow(()=>assertSceneFormatRoundTripReceipt(valid));
  assert.throws(()=>assertSceneFormatRoundTripReceipt({...valid,lost:['animations']}),/receipt_invalid/);
  assert.doesNotThrow(()=>assertSceneFormatRoundTripReceipt({...valid,passed:false,lost:['animations']}));
});


test('source-hash receipts are strict and cannot be interpreted as a successful format import',()=>{
  const data={uri:'r2-assets/part.blend',identification:'extension-hint',format:'blend',sha256:'a'.repeat(64),byteLength:384};
  assert.doesNotThrow(()=>assertSceneFormatReferenceReceipt(data));
  assert.throws(()=>assertSceneFormatReferenceReceipt({...data,sha256:'not-sha256'}),/reference_receipt_invalid/);
  assert.throws(()=>assertSceneFormatReferenceReceipt({...data,byteLength:-1}),/reference_receipt_invalid/);
  assert.throws(()=>assertSceneFormatReferenceReceipt({...data,identification:'verified-content'}),/reference_receipt_invalid/);
});
