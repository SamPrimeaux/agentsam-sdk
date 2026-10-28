import test from 'node:test';
import assert from 'node:assert/strict';
import {createOcctMeshGeometry} from '../src/occt.js';
class BufferAttribute {constructor(array,itemSize){this.array=array;this.itemSize=itemSize;}}
class BufferGeometry {
  constructor(){this.attributes={};}
  setAttribute(name,attr){this.attributes[name]=attr;}
  setIndex(indices){this.indices=indices;}
  computeBoundingSphere(){this.boundsReady=true;}
}
const runtime={THREE:{BufferGeometry,BufferAttribute}};
const mesh={
  units:'mm',axes:'z-up',
  positions:[0,0,0,1000,0,0,0,1000,0],
  normals:[0,0,1,0,0,1,0,0,1],
  indices:[0,1,2],
};
test('OCCT display adapter converts native millimeters Z-up and retains native source untouched',()=>{
  const src=structuredClone(mesh);
  const geometry=createOcctMeshGeometry(mesh,runtime);
  assert.deepEqual([...geometry.attributes.position.array],[0,0,0,1,0,0,0,0,-1]);
  assert.deepEqual([...geometry.attributes.normal.array],[0,1,0,0,1,0,0,1,0]);
  assert.deepEqual(geometry.indices,[0,1,2]);
  assert.equal(geometry.boundsReady,true);
  assert.deepEqual(mesh,src);
});
test('OCCT alternate signed axis reverses winding, preserving coherent normals',()=>{
  const geometry=createOcctMeshGeometry(mesh,runtime,{planYSign:1});
  assert.deepEqual(geometry.indices,[0,2,1]);
  assert.deepEqual([...geometry.attributes.position.array].slice(-3),[0,0,1]);
});
test('OCCT adapter rejects malformed and non-native data rather than displaying deceptive solids',()=>{
  assert.throws(()=>createOcctMeshGeometry({...mesh,units:'m'},runtime),/coordinate_contract/);
  assert.throws(()=>createOcctMeshGeometry({...mesh,indices:[0,1,999]},runtime),/values_invalid/);
  assert.throws(()=>createOcctMeshGeometry({...mesh,positions:[0,0,0,NaN,1,0]},runtime),/topology_invalid|values_invalid/);
  assert.throws(()=>createOcctMeshGeometry(mesh,runtime,{planYSign:0}),/axis_sign_invalid/);
});
