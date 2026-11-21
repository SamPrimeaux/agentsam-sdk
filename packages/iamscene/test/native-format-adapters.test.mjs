import test from 'node:test';
import assert from 'node:assert/strict';
import { createIAMSceneNativeFormatRegistry } from '../dist/src/node.js';
import { createSceneDocument } from '../dist/src/index.js';

const binary = process.env.AGENTSAM_OCCT_BIN;

test('actual native OCCT registers and exports STEP/BREP/IFC with evidence, not unsupported imports', {skip: !binary}, async () => {
  const registry = await createIAMSceneNativeFormatRegistry({binary});
  const doc=createSceneDocument({id:'native-formats',name:'Geometry export'});
  doc.scene.nodes.push({id:'test-wall',name:'Test Wall',kind:'mesh',parentId:'scene-root',
    transform:{position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},visible:true,
    geometry:{type:'occt',units:'mm',operations:[{id:'test-wall',type:'wall',start:[0,0],end:[2000,0],thickness:200,height:3000}]}});
  for (const format of ['step','brep','ifc']) {
    assert.equal(registry.describe(format).operations.export,'implemented');
    assert.equal(registry.describe(format).operations.import,'unavailable');
    const output=await registry.export(`test-wall.${format}`,{kind:'scene',value:doc});
    assert.ok(output.bytes.byteLength>100,format);
    assert.equal(output.format,format);
    if(format==='ifc') {
      const ifc=new TextDecoder().decode(output.bytes);
      assert.match(ifc,/ISO-10303-21/);
      assert.match(ifc,/IFCWALL/);
      assert.match(ifc,/IFCPROJECT/);
    }
    if(format==='step') assert.match(new TextDecoder().decode(output.bytes.subarray(0,200)),/ISO-10303-21/);
  }
  assert.equal(registry.describe('ifczip').operations.export,'unavailable');
});
