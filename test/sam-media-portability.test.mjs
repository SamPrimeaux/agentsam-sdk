import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { inspectMediaEnvironment, readMediaStorageSelection } from '../src/sam/media/environment.js';
import { createObjectMediaStore } from '../src/sam/adapters/object-media-store.js';
import { createLocalMediaStore } from '../src/sam/adapters/local-media-store.js';
import { runSamMedia } from '../src/commands/sam-media.js';
import { createMediaHandlers } from '../src/sam/operation-packs/generated-v2/raster.js';
import { createShellSamAdapter } from '../src/sam/shell-host.js';

function bucket() {
  const map=new Map();
  return {map,async get(k) {const b=map.get(k);return b?{arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}:null;},
    async put(k,v) {map.set(k,typeof v==='string'?new TextEncoder().encode(v):Uint8Array.from(v));},
    async delete(k) {map.delete(k);}};
}
async function workspace(fn) {
  const dir=await mkdtemp(path.join(os.tmpdir(),'sam-media-test-'));
  try { return await fn(dir); } finally {await rm(dir,{recursive:true,force:true});}
}
const principal={accountId:'account_demo',actorId:'user_demo',installationId:'project_demo'};
test('discovery distinguishes declared bindings from connected authorized adapters',async()=>{
  await workspace(async root=>{
    await writeFile(path.join(root,'wrangler.toml'),`[[r2_buckets]]
binding = "WEBSITE_ASSETS"
bucket_name = "merchant-private"
[[d1_databases]]
binding = "DB"
database_name = "merchant"
`);
    const doctor=inspectMediaEnvironment({root,binaryProbe:()=>false,packageProbe:()=>false});
    assert.equal(doctor.storage[0].status,'available');
    assert.equal(doctor.storage[1].status,'configuration_detected');
    assert.equal(doctor.storage[2].status,'configuration_detected');
    assert.equal(doctor.storage[1].requires[0],'authorized_object_store_adapter');
    assert.equal(JSON.stringify(doctor).includes('merchant-private'),false);
    const connected=inspectMediaEnvironment({root,binaryProbe:()=>false,packageProbe:()=>false,
      connected:{objectStore:{get(){},put(){}},index:{register(){}}}});
    assert.equal(connected.storage[2].status,'adapter_connected');
    assert.equal(connected.read_only,true);
  });
});
test('setup requires consent and cannot activate a configuration-only R2 binding',async()=>{
  await workspace(async root=>{
    const output=[];
    const options={root,write:x=>output.push(x),inspect:inspectMediaEnvironment};
    assert.equal((await runSamMedia(['setup','--storage','local'],options)).error,'media_setup_confirmation_required');
    assert.equal(readMediaStorageSelection(root),null);
    const remote=await runSamMedia(['setup','--storage','r2','--yes'],options);
    assert.equal(remote.error,'storage_adapter_not_connected');
    assert.equal(readMediaStorageSelection(root),null);
    const chosen=await runSamMedia(['setup','--storage','local','--yes'],options);
    assert.equal(chosen.ok,true);
    assert.equal(readMediaStorageSelection(root).kind,'local');
    assert.equal(JSON.parse(await readFile(path.join(root,'.agentsam/media/storage.v1.json'),'utf8')).schema,
      'agentsam.media.storage.v1');
  });
});
test('R2-compatible object store keeps originals immutable, checks ownership and detects corruption',async()=>{
  const b=bucket(),store=createObjectMediaStore({bucket:b});
  const data=new TextEncoder().encode('initial clean logo pixels');
  const parent=await store.importAsset({...principal,bytes:data,contentType:'image/png'});
  const original=await store.getOwnedAsset({...principal,assetId:parent.id});
  assert.deepEqual(original.bytes,data);
  const derived=await store.writeDerivative({...principal,sourceAssetId:parent.id,
    sourceHash:parent.sha256,bytes:new TextEncoder().encode('new image pixels'),
    transformations:['image.crop'],contentType:'image/png'});
  assert.notEqual(derived.id,parent.id);
  assert.equal((await store.getOwnedAsset({...principal,assetId:parent.id})).sha256,parent.sha256);
  assert.equal(await store.getOwnedAsset({...principal,assetId:parent.id,accountId:'other'}),null);
  await assert.rejects(store.writeDerivative({...principal,sourceAssetId:parent.id,
    sourceHash:'wrong-version',bytes:data,contentType:'image/png'}),/media_source_version_conflict/);
  const key=[...b.map.keys()].find(k=>k.endsWith(derived.id+'.bin'));
  b.map.set(key,new TextEncoder().encode('tampered'));
  await assert.rejects(store.getOwnedAsset({...principal,assetId:derived.id}),/media_integrity_or_scope_mismatch/);
});
test('object store and optional host-owned index roll back new objects on failed registration',async()=>{
  const b=bucket();
  const store=createObjectMediaStore({bucket:b,index:{register:async()=>{throw Error('db offline');}}});
  await assert.rejects(store.importAsset({...principal,bytes:new Uint8Array([1,2,3]),
    contentType:'model/gltf-binary'}),/db offline/);
  assert.equal(b.map.size,0);
});
test('same SAM pixel transform works against injected R2 and local file stores',async()=>{
  await workspace(async root=>{
    const b=bucket(),local=createLocalMediaStore({root:path.join(root,'objects')});
    const remote=createObjectMediaStore({bucket:b});
    const input=new TextEncoder().encode('valid bytes from an already inspected asset');
    for (const store of [local,remote]) {
      const imported=await store.importAsset({...principal,bytes:input,contentType:'image/png'});
      // The transform uses a storage-neutral Sharp interface; no provider cloud call.
      const sharp=() => ({rotate() {return this;},resize() {return this;},
        png() {return this;},async toBuffer() {return Buffer.from([7,9,11]);}});
      const transform=createMediaHandlers({assetStore:store,sharp})['media.image.resize'];
      const derivative=await transform({assetId:imported.id,width:200},principal);
      assert.equal(derivative.ok,true);
      assert.notEqual(derivative.derivativeAssetId,imported.id);
      assert.equal((await store.getOwnedAsset({...principal,assetId:imported.id})).sha256,
        imported.sha256);
    }
  });
});
test('explicit R2 selection never falls back to local media without a host binding',async()=>{
  await workspace(async root=>{
    await mkdir(path.join(root,'.agentsam/media'),{recursive:true});
    await writeFile(path.join(root,'.agentsam/media/storage.v1.json'),
      JSON.stringify({schema:'agentsam.media.storage.v1',kind:'r2'}));
    const adapter=createShellSamAdapter({
      state:{cwd:root,projectRoot:root,home:root},
      trustedIdentity:principal,authorize:async()=>true,
    });
    assert.ok(adapter);
    assert.equal(adapter.canInvoke('media.image.inspect'),false);
    assert.equal(adapter.canInvoke('sam.superbash'),true);
  });
});

test('SAM host genuinely binds a selected R2-only media lane with no D1 index', async()=>{
  await workspace(async root=>{
    await mkdir(path.join(root,'.agentsam/media'),{recursive:true});
    await writeFile(path.join(root,'.agentsam/media/storage.v1.json'),
      JSON.stringify({schema:'agentsam.media.storage.v1',kind:'r2'}));
    const objectStore=bucket();
    const recordStore=createObjectMediaStore({bucket:objectStore});
    const png=Uint8Array.from(Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pCsAAAAASUVORK5CYII=',
      'base64'));
    const asset=await recordStore.importAsset({...principal,bytes:png,contentType:'image/png'});
    const adapter=createShellSamAdapter({
      state:{cwd:root,projectRoot:root,home:root},trustedIdentity:principal,
      authorize:async()=>true,mediaBindings:{bucket:objectStore},
    });
    assert.equal(adapter.canInvoke('media.image.inspect'),true);
    const result=await adapter.invoke('media.image.inspect',{assetId:asset.id});
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal(result.data.width,1);
    assert.equal((await recordStore.getOwnedAsset({...principal,assetId:asset.id})).sha256,asset.sha256);
  });
});
