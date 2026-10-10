import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  AgentSamClient, createSamOS, createSamCapabilityAdapter, createLocalMediaStore,
} from '../../src/sam/index.js';
import { buildAgentToolSurface } from '../../src/agent/responses-runner.js';

const identity = { accountId: 'accountA', actorId: 'actorA', installationId: 'installationA' };
const other = { accountId: 'accountB', actorId: 'actorB', installationId: 'installationB' };
const make = (store, principal, allowed = () => true) => createSamOS({
  core: true,
  generated: {
    assetStore: store, sharp,
    resolveTrustedContext: async () => principal,
    authorize: async ({ operation }) => allowed(operation),
  },
});

test('actual image bytes -> SAM background remove -> durable derivative -> model tool; tenants isolated', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sam-os-media-'));
  try {
    const store = createLocalMediaStore({ root: tmp });
    const pixels = Buffer.alloc(9 * 9 * 4);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const i = (y*9+x)*4, black = x >= 3 && x <= 5 && y >= 3 && y <= 5;
      pixels.set([black?0:255, black?0:255, black?0:255,255],i);
    }
    const bytes = await sharp(pixels,{ raw:{ width:9,height:9,channels:4 }}).png().toBuffer();
    const source = await store.importAsset({ ...identity, bytes, contentType:'image/png' });

    const firstOS = make(store, identity);
    const sam = new AgentSamClient({ os:firstOS });
    assert.equal((await sam.describe('media.image.background.remove')).ok,true);
    assert.equal((await sam.describe('media.image.resize')).ok,true);
    assert.equal((await sam.describe('sam.superbash')).ok,false);
    const inspected = await sam.invoke('media.image.inspect',{assetId:source.id});
    assert.equal(inspected.ok,true);
    assert.equal(inspected.data.width,9);
    const resized = await sam.invoke('media.image.resize',{assetId:source.id,width:4,height:4});
    assert.equal(resized.ok,true,JSON.stringify(resized.error));
    const resizedAsset = await store.getOwnedAsset({...identity,assetId:resized.data.derivativeAssetId});
    assert.equal((await sharp(resizedAsset.bytes).metadata()).width,4);
    const optimized = await sam.invoke('media.image.optimize',{assetId:source.id});
    assert.equal(optimized.ok,true,JSON.stringify(optimized.error));
    const optimizedAsset = await store.getOwnedAsset({...identity,assetId:optimized.data.derivativeAssetId});
    assert.equal((await sharp(optimizedAsset.bytes).metadata()).format,'webp');
    const found = await sam.discover({query:'background remove'});
    assert.ok(found.operations.some(op=>op.id==='media.image.background.remove'));

    const adapter = createSamCapabilityAdapter({
      os:firstOS, client:sam, expose:['media.image.background.remove','media.image.resize'],
      authorize: async ({operation}) => operation === 'media.image.background.remove',
    });
    assert.deepEqual(adapter.toolDescriptors().map(x=>x.name).sort(), ['media.image.background.remove','media.image.resize']);
    const tools = buildAgentToolSurface(adapter,'remove image background',{maxTools:8});
    assert.ok(tools.tools.length > 0, 'actual bound media tool reaches model selection');
    assert.equal((await adapter.invoke('media.image.resize',{assetId:source.id,width:4})).error,'sam_tool_not_authorized');
    const result = await adapter.invoke('media.image.background.remove',{assetId:source.id});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.equal(result.receipt.status,'completed');
    const output = await store.getOwnedAsset({ ...identity,assetId:result.data.derivativeAssetId });
    assert.ok(output);
    assert.equal(output.sourceAssetId,source.id);
    assert.equal(output.sourceHash,source.sha256);
    assert.equal(output.sha256,result.data.derivativeHash);
    const [raw,info] = await sharp(output.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject:true }).then(x=>[x.data,x.info]);
    assert.equal(info.width,9);
    assert.equal(raw[3],0,'background becomes transparent');
    assert.equal(raw[(4*9+4)*4+3],255,'subject remains opaque');
    const reloaded = await store.getOwnedAsset({ ...identity, assetId:source.id });
    assert.deepEqual(reloaded.bytes,bytes,'original never mutated');

    // Tenant B can find the installed tool, but cannot read tenant A source.
    const secondOS = make(store,other);
    const second = await new AgentSamClient({os:secondOS}).invoke('media.image.background.remove',{assetId:source.id});
    assert.equal(second.ok,false);
    assert.equal(second.error.code,'asset_not_found_or_forbidden');
    assert.equal(second.receipt.status,'failed');
  } finally {await fs.rm(tmp,{recursive:true,force:true});}
});
