import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectGlb } from '../glb.js';
function fixture() {
  const json = Buffer.from(JSON.stringify({asset:{version:'2.0'},meshes:[{primitives:[{}]}],nodes:[{}]}));
  const padding = (4-json.length%4)%4;
  const bytes = Buffer.alloc(12+8+json.length+padding);
  bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);
  bytes.writeUInt32LE(json.length+padding,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);
  bytes.fill(0x20,20+json.length);
  return bytes;
}
test('GLB structural inspect returns counts',()=>{
  const result=inspectGlb(fixture());
  assert.equal(result.ok,true);assert.equal(result.meshes,1);assert.equal(result.primitives,1);assert.equal(result.mediaKind,'model3d');
});
test('GLB malformed header is rejected',()=>{
  const b=fixture();b[0]=0;assert.throws(()=>inspectGlb(b),/magic/);
});
