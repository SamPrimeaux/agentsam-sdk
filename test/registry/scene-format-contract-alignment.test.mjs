import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { getCapabilityManifest } from '../../src/capabilities/manifest.js';
import { createRegistry } from '../../src/registry/index.js';
import { createIAMSceneFormatRegistry } from '../../packages/iamscene/dist/src/index.js';
import { createIAMSceneNativeFormatRegistry } from '../../packages/iamscene/dist/src/node.js';
import {
  AGENTSAM_SCENE_FORMAT_CONTRACT, SCENE_FORMAT_OPERATIONS,
  assertSceneFormatCapability, assertSceneFormatRoundTripReceipt, assertSceneFormatReferenceReceipt,
} from '../../packages/agentsam-contracts/dist/scene-format.js';

const read = (path) => JSON.parse(readFileSync(new URL('../../' + path, import.meta.url), 'utf8'));
const packageManifest = read('packages/iamscene/agentsam.package.json');
const contractsManifest = read('packages/agentsam-contracts/agentsam.package.json');
const manifest = getCapabilityManifest();
const publicIds = [
  'iamscene.format.list', 'iamscene.format.import', 'iamscene.format.export',
  'iamscene.format.reference', 'iamscene.format.round-trip', 'iamscene.native.export',
];

test('root protocol capability manifest is schema-valid, including package-only interchange APIs', () => {
  const ajv = new Ajv2020({allErrors:true,strict:false});
  const validate = ajv.compile(read('protocol/capabilities/capability-manifest.schema.json'));
  assert.equal(validate(manifest),true,JSON.stringify(validate.errors));
  const exposed = createIAMSceneFormatRegistry();
  const methods = new Map([
    ['iamscene.format.list','list'],['iamscene.format.import','import'],
    ['iamscene.format.export','export'],['iamscene.format.reference','reference'],
    ['iamscene.format.round-trip','roundTrip'],
  ]);
  for (const id of publicIds) {
    const item = manifest.capabilities[id];
    assert.equal(item?.id,id);
    assert.equal(item.package, '@inneranimalmedia/iamscene');
    assert.equal(item.contract, AGENTSAM_SCENE_FORMAT_CONTRACT);
    assert.equal(item.api_only,true, `${id} must not claim host dispatch`);
    assert.equal(item.status,'experimental');
    assert.equal(item.kind,'capability');
    assert.ok(item.description.includes(id==='iamscene.format.list' ? 'List' : id==='iamscene.native.export' ? 'OCCT' : ''));
    if (methods.has(id)) {
      assert.equal(item.export,'createIAMSceneFormatRegistry');
      assert.equal(typeof exposed[methods.get(id)],'function',id);
    } else {
      assert.equal(item.export, createIAMSceneNativeFormatRegistry.name);
      assert.equal(item.package_subpath,'./node');
    }
  }
  const discovered = createRegistry();
  for (const id of publicIds) {
    const row=discovered.describe(id);
    assert.ok(row,id);
    assert.equal(row.agent_callable,false,'a package API cannot become agent-callable by declaring it');
    assert.equal(row.handler_bound,false);
    assert.equal(row.contract,AGENTSAM_SCENE_FORMAT_CONTRACT);
  }
});

test('root package catalog, canonical package manifests and actual registry stay aligned', async () => {
  const catalog = read('packages/catalog/generated/packages.json');
  const sourceTypes = read('contracts/source-types.v2.json');
  const sourceSchema = read('contracts/source-types.v2.schema.json');
  const validateSourceTypes = new Ajv2020({allErrors:true,strict:false,validateFormats:false}).compile(sourceSchema);
  assert.equal(validateSourceTypes(sourceTypes),true,JSON.stringify(validateSourceTypes.errors));
  assert.equal(sourceTypes.version,'2.0.1');
  assert.ok(sourceTypes.families.some(f=>f.id==='model.geometry'));
  assert.equal(sourceTypes.formats.find(f=>f.id==='model.iamgeometry')?.family,'model.geometry');
  const sourceFormats = new Map(sourceTypes.formats.map(item=>[item.id,item]));
  const actualFormatRegistry = createIAMSceneFormatRegistry();
  const typeIds = new Map(sourceTypes.formats.map(entry=>[entry.id,entry]));
  for (const descriptor of actualFormatRegistry.list()) {
    assert.ok(descriptor.sourceTypeIds?.length, `source type mapping missing for ${descriptor.id}`);
    const sourceRecords=descriptor.sourceTypeIds.map(id=>{
      const item=typeIds.get(id);
      assert.ok(item, `source type ${id} missing from authoritative catalog`);
      return item;
    });
    for (const extension of descriptor.extensions)
      assert.ok(sourceRecords.some(item=>item.extensions.includes(extension)), `no source identity for ${descriptor.id} ${extension}`);
  }

  for (const [assetId, formatId] of [['model.iamscene','iamscene'],['model.iamgeometry','iamgeometry']]) {
    const source = sourceFormats.get(assetId);
    assert.ok(source,assetId);
    assert.deepEqual(source.extensions,actualFormatRegistry.describe(formatId).extensions);
    assert.ok(source.identificationSignals.includes('content'));
  }
  const generated = read('src/registry/generated/inventory.json');
  const iam = catalog.packages.find(entry=>entry.id==='iamscene');
  const contracts = catalog.packages.find(entry=>entry.id==='agentsam-contracts');
  const sceneFormatSchema=read('packages/agentsam-contracts/schemas/scene-format.v1.schema.json');
  const validateFormat = new Ajv2020({allErrors:true,strict:false}).compile(sceneFormatSchema);
  for (const descriptor of createIAMSceneFormatRegistry().list()) assert.equal(validateFormat(descriptor),true,JSON.stringify(validateFormat.errors));
  const validateReference = new Ajv2020({allErrors:true,strict:false}).compile(sceneFormatSchema.$defs.referenceReceipt);
  const validateRoundTrip = new Ajv2020({allErrors:true,strict:false}).compile(sceneFormatSchema.$defs.roundTripReceipt);
  const testReference = await createIAMSceneFormatRegistry().reference('sample.blend',new Uint8Array([1,2,3]));
  assertSceneFormatReferenceReceipt(testReference);
  assert.equal(validateReference(testReference),true,JSON.stringify(validateReference.errors));
  assert.equal(testReference.identification,'extension-hint');
  assert.equal(createIAMSceneFormatRegistry().describe('blend').operations.import,'unavailable');
  assert.equal(validateRoundTrip({format:'blend',passed:true,preserved:[],lost:['animations'],warnings:[]}),false);

  assert.deepEqual(iam,packageManifest);
  assert.deepEqual(contracts,contractsManifest);
  assert.equal(iam.version, read('packages/iamscene/package.json').version);
  assert.equal(contracts.version,read('packages/agentsam-contracts/package.json').version);
  assert.equal(iam.format_registry.contract,AGENTSAM_SCENE_FORMAT_CONTRACT);
  assert.deepEqual(iam.format_registry.operations,[...SCENE_FORMAT_OPERATIONS]);
  assert.equal(iam.format_registry.authority,'packages/iamscene/src/format-registry.ts');
  assert.equal(generated.counts.capabilities,Object.keys(manifest.capabilities).length);
  for (const id of publicIds) assert.ok(generated.capabilities.some(item=>item.id===id),id);
  for (const proof of [iam.evidence.schema,iam.evidence.geometry_schema,iam.evidence.format_registry, ...iam.evidence.tests,contracts.evidence.scene_format_contract,contracts.evidence.scene_format_schema]) {
    assert.ok(existsSync(new URL('../../'+proof,import.meta.url)), proof);
  }
});

test('every real IAMScene format descriptor implements exactly the portable contract', async () => {
  const runtime=createIAMSceneFormatRegistry();
  for(const format of runtime.list()) {
    assertSceneFormatCapability(format);
    assert.deepEqual(Object.keys(format.operations).sort(),[...SCENE_FORMAT_OPERATIONS].sort(),format.id);
    assert.equal(runtime.describe(format.id).id, format.id);
  }
  assert.equal(runtime.describe('blend').operations.import,'unavailable');
  assert.equal(runtime.describe('ifc').operations.export,'unavailable','native capability needs actual doctor probe');
  assert.equal(runtime.describe('gltf').operations['round-trip'],'implemented');
  assert.equal(runtime.describe('stl').operations.import,'implemented');
  assert.equal(runtime.describe('stl').operations.export,'unavailable');
  const original={format:'iamgeometry',formatVersion:'1.0.0',id:'proof',name:'Proof',units:'m',defaultRenderId:'preview',representations:[{id:'preview',role:'render',format:'glb',uri:'./proof.glb'}]};
  const receipt=await runtime.roundTrip('proof.iamgeometry',JSON.stringify(original),{id:'proof',assetUri:'./proof.iamgeometry'});
  assertSceneFormatRoundTripReceipt(receipt);
  assert.equal(receipt.passed,true);
});


test('root AgentSam CLI discovers experimental IAMScene package APIs without calling nonexistent handlers', () => {
  const cli = new URL('../../bin/agentsam', import.meta.url).pathname;
  const base = new URL('../../', import.meta.url).pathname;
  const run = (args) => execFileSync(process.execPath,[cli,'capabilities',...args],{
    cwd:base,encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024,
  });
  const inventory=JSON.parse(run(['--inventory','--search','iamscene','--json']));
  for (const id of publicIds) {
    const item=inventory.find(entry=>entry.id===id);
    assert.equal(item?.api_only,true,id);
    assert.equal(item?.agent_callable,false,id);
  }
  const listing=run(['--all']);
  assert.match(listing,/iamscene\.format\.round-trip/);
  assert.match(listing,/package API; no host handler/);
  const specific=JSON.parse(run(['iamscene.format.reference','--json']));
  assert.equal(specific.id,'iamscene.format.reference');
});
