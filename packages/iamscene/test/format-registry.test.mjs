import test from 'node:test';
import assert from 'node:assert/strict';
import { createIAMSceneFormatRegistry, createSceneDocument, serializeSceneDocument, parseIAMGeometry, encodeGltfAsset, parseGltfAsset } from '../dist/src/index.js';

const options = { id: 'format-acceptance', name: 'Format Acceptance', assetUri: './original.gltf' };
const gltfJSON = { asset: { version:'2.0' }, scene: 0, scenes:[{ name:'Main', nodes:[0] }], nodes:[{name:'Editable object', translation:[1,2,3]}] };

test('registry catalogs target file families without inventing import/export support', () => {
  const registry = createIAMSceneFormatRegistry();
  const all = registry.list();
  assert.ok(all.length >= 30);
  for (const extension of ['.iamscene.json','.iamgeometry','.gltf','.glb','.step','.stp','.iges','.brep','.stl','.3mf','.obj','.ply','.ifc','.ifczip','.usd','.usda','.usdc','.usdz','.blend','.fbx','.dae','.abc','.vdb','.dxf','.dwg','.svg','.las','.laz','.e57','.png','.jpg','.exr','.hdr','.ktx2','.mp4','.mov','.mkv','.wav','.flac','.otio','.otioz']) {
    const descriptor = registry.identify(`https://cdn.invalid/asset${extension}?rev=1`);
    assert.equal(descriptor.operations['live-reference'], 'implemented', extension);
  }
  assert.equal(registry.identify('my.scene.iamscene.json').id,'iamscene');
  assert.equal(registry.identify('PART.STP').id,'step');
  assert.equal(registry.describe('ifc').operations.import,'unavailable');
  assert.equal(registry.describe('blend').operations.export,'unavailable');
});

test('native IAM scene imports, exports and proves semantic round-trip', async () => {
  const registry = createIAMSceneFormatRegistry();
  const scene = createSceneDocument({ id:'t1',name:'Native' });
  const source = serializeSceneDocument(scene);
  const imported = await registry.import('native.iamscene', source, options);
  assert.equal(imported.document.kind,'scene');
  assert.equal(imported.document.value.metadata.id,'t1');
  const exported = await registry.export('native.iamscene.json',imported.document);
  assert.equal(JSON.parse(new TextDecoder().decode(exported.bytes)).metadata.id,'t1');
  const receipt = await registry.roundTrip('native.iamscene',source,options);
  assert.equal(receipt.passed,true);
  assert.deepEqual(receipt.lost,[]);
});

test('IAM geometry round-trips with immutable source identity', async () => {
  const registry = createIAMSceneFormatRegistry();
  const manifest = { format:'iamgeometry',formatVersion:'1.0.0',id:'wall-001',name:'Wall',units:'mm',defaultRenderId:'render',representations:[{id:'render',role:'render',format:'glb',uri:'./wall.glb'}],source:{schema:'cad.project.v2',uri:'./building.cad',elementId:'wall-001',revision:12}};
  const encoded=JSON.stringify(manifest);
  const loaded=await registry.import('wall.iamgeometry',encoded,options);
  assert.equal(loaded.document.value.source.revision,12);
  const exported=await registry.export('wall.iamgeometry',loaded.document);
  assert.equal(parseIAMGeometry(exported.bytes).id,'wall-001');
  assert.equal((await registry.roundTrip('wall.iamgeometry',encoded,options)).passed,true);
});

test('glTF text and binary preserve editable hierarchy through import and round-trip', async () => {
  const registry = createIAMSceneFormatRegistry();
  const gltf=JSON.stringify(gltfJSON);
  const source=await registry.import('asset.gltf',gltf,options);
  assert.ok(source.document.value.scene.nodes.some(n=>n.name==='Editable object'));
  const exported=await registry.export('asset.gltf',source.document,{original:gltf});
  assert.equal(parseGltfAsset(exported.bytes).json.nodes[0].name,'Editable object');
  assert.equal((await registry.roundTrip('asset.gltf',gltf,options)).passed,true);
  const glb=await encodeGltfAsset({format:'gltf',json:gltfJSON},{format:'glb'});
  const binary={...options,assetUri:'./original.glb'};
  const opened=await registry.import('asset.glb',glb,binary);
  assert.equal(opened.document.kind,'scene');
  const receipt=await registry.roundTrip('asset.glb',glb,binary);
  assert.equal(receipt.passed,true,JSON.stringify(receipt));
});

test('reference hashes verify content and refresh detects a changed external revision', async () => {
  const registry=createIAMSceneFormatRegistry();
  const first=await registry.reference('https://example.org/scan.e57',new Uint8Array([1,2,3]));
  assert.equal(first.identification,'extension-hint');
  assert.equal(first.byteLength,3);
  assert.equal(first.sha256.length,64);
  await assert.rejects(registry.reference(first.uri,new Uint8Array([1,2,4]),{expectedSha256:first.sha256}),/hash_mismatch/);
  const unchanged=await registry.refreshReference(first,async()=>new Uint8Array([1,2,3]));
  assert.equal(unchanged.changed,false);
  const changed=await registry.refreshReference(first,async()=>new Uint8Array([1,2,4]));
  assert.equal(changed.changed,true);
  assert.equal(changed.reference.format,'e57');
});

test('unsupported conversion is explicit and adapters require a known format', async () => {
  const registry=createIAMSceneFormatRegistry();
  await assert.rejects(registry.import('model.blend',new Uint8Array([1,2,3]),options),/import_unavailable:blend/);
  await assert.rejects(registry.export('model.step',{kind:'scene',value:createSceneDocument({id:'1',name:'t'})}),/export_unavailable:step/);
  await assert.rejects(registry.roundTrip('model.ifc',new Uint8Array([1,2]),options),/round_trip_unavailable:ifc/);
  assert.throws(()=>registry.registerAdapter('nonsense',{import:()=>null}),/unknown/);
  assert.throws(()=>registry.registerAdapter('glb',{import:()=>null}),/already_registered/);
});

test('STL, OBJ and PLY import into independently editable IAMGeometry + GLB assets', async () => {
  const registry=createIAMSceneFormatRegistry();
  const fixtures={
    stl:'solid one\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1000 0 0\nvertex 0 1000 0\nendloop\nendfacet\nendsolid one\n',
    obj:'o face\nv 0 0 0\nv 1000 0 0\nv 0 1000 0\nf 1 2 3\n',
    ply:'ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1000 0 0\n0 1000 0\n3 0 1 2\n',
  };
  for (const [format,source] of Object.entries(fixtures)) {
    assert.equal(registry.describe(format).operations.import,'implemented');
    assert.equal(registry.describe(format).operations.export,'unavailable');
    const imported=await registry.import(`face.${format}`,source,{...options,id:`sample-${format}`,assetUri:`./face.${format}`,sourceUnits:'mm'});
    assert.equal(imported.document.kind,'scene');
    const nodes=imported.document.value.scene.nodes.filter(n=>n.kind==='mesh');
    assert.equal(nodes.length,1,format);
    const manifest=imported.generatedFiles.find(f=>f.uri.endsWith('.iamgeometry'));
    const glb=imported.generatedFiles.find(f=>f.uri.endsWith('.glb'));
    assert.ok(manifest && glb);
    const geometries=parseIAMGeometry(manifest.bytes);
    assert.equal(geometries.representations.find(r=>r.role==='render').units,'m');
    assert.equal(geometries.source.uri,`./face.${format}`);
    const preview=parseGltfAsset(glb.bytes);
    const position=preview.json.accessors[0];
    assert.equal(position.count,3);
    assert.ok(position.max[0] > 0.99 && position.max[0] < 1.01,format);
    const sceneAsset=imported.document.value.assets.find(a=>a.id===nodes[0].assetRef);
    assert.ok(sceneAsset.uri.endsWith('.iamgeometry'),format);
  }
  await assert.rejects(registry.import('unknown.stl',fixtures.stl,options),/source_units_required/);
});

test('custom format registrations do not masquerade as importers', async () => {
  const registry=createIAMSceneFormatRegistry();
  registry.registerFormat({id:'user-format',family:'dcc',extensions:['.my3d'],limitations:['source-only']});
  assert.equal(registry.describe('user-format').operations.import,'unavailable');
  const ref=await registry.reference('reference.my3d','asset bytes');
  assert.equal(ref.format,'user-format');
  assert.throws(()=>registry.registerFormat({id:'collision',family:'dcc',extensions:['.my3d']}),/duplicate/);
});

test('PLY point clouds do not become fabricated triangles',async()=>{
  const registry=createIAMSceneFormatRegistry();
  const points='ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n1 0 0\n0 1 0\n';
  await assert.rejects(registry.import('pointcloud.ply',points,{...options,sourceUnits:'m'}),/faces_required/);
});
