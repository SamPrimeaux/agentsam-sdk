import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { AgentSamClient, createSamOS, createLocalMediaStore } from '../../../../src/sam/index.js';

const account = { accountId: 'acct_real', actorId: 'actor_real', installationId: 'install_real' };
const intruder = { accountId: 'acct_other', actorId: 'actor_other', installationId: 'install_other' };

function glbFixture() {
  const json = Buffer.from(JSON.stringify({asset:{version:'2.0'},meshes:[{primitives:[{}]}]}));
  const padding = (4 - json.length % 4) % 4;
  const bytes = Buffer.alloc(20 + json.length + padding, 0x20);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(json.length + padding, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  json.copy(bytes, 20);
  return bytes;
}

function clientFor(assetStore, principal, authorize = async () => true) {
  return new AgentSamClient({ os: createSamOS({
    core:false, generated:{
      assetStore, resolveTrustedContext: async () => principal, authorize,
    },
  }) });
}

test('generated-v2 asset inspect binds real local store, returns authoritative lineage and rejects forged scope', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sam-asset-inspect-'));
  try {
    const store = createLocalMediaStore({root:dir});
    const saved = await store.importAsset({...account, bytes:Buffer.from('immutable source'), contentType:'text/plain'});
    const client = clientFor(store, account);
    assert.equal((await client.describe('media.asset.inspect')).ok,true);
    const inspected = await client.invoke('media.asset.inspect',{assetId:saved.id});
    assert.equal(inspected.ok,true,JSON.stringify(inspected.error));
    assert.equal(inspected.data.assetId,saved.id);
    assert.equal(inspected.data.sha256,saved.sha256);
    assert.equal(inspected.data.contentType,'text/plain');
    assert.equal(inspected.data.byteLength,16);
    assert.equal(inspected.data.sourceAssetId,null);

    const forged = await client.invoke('media.asset.inspect',{assetId:saved.id,accountId:'acct_other'});
    assert.equal(forged.ok,false);
    const foreign = await clientFor(store,intruder).invoke('media.asset.inspect',{assetId:saved.id});
    assert.equal(foreign.ok,false);
    const denied = await clientFor(store,account,async()=>false).invoke('media.asset.inspect',{assetId:saved.id});
    assert.equal(denied.ok,false);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('generated-v2 GLB validation executes real structural checks without claiming full conformance', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sam-glb-validate-'));
  try {
    const store = createLocalMediaStore({root:dir});
    const good = await store.importAsset({...account,bytes:glbFixture(),contentType:'model/gltf-binary'});
    const bad = await store.importAsset({...account,bytes:Buffer.from('not a glb'),contentType:'model/gltf-binary'});
    const client = clientFor(store, account);
    assert.equal((await client.describe('media.model.validate')).ok,true);
    const valid = await client.invoke('media.model.validate',{assetId:good.id});
    assert.equal(valid.ok,true,JSON.stringify(valid.error));
    assert.equal(valid.data.meshes,1);
    assert.equal(valid.data.validationLevel,'structural_only');
    assert.equal(valid.data.conformanceVerified,false);
    const invalid = await client.invoke('media.model.validate',{assetId:bad.id});
    assert.equal(invalid.ok,false);
    const foreign = await clientFor(store,intruder).invoke('media.model.validate',{assetId:good.id});
    assert.equal(foreign.ok,false);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
