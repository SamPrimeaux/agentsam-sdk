import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaHandlers } from '../raster.js';
function mockSharp(arg,options) {
  // Exercise the actual pixel algorithm while standing in for image codecs.
  if(options?.raw) return {png(){return {toBuffer:async()=>Buffer.from(arg)};}};
  const width=7,height=7;const pixels=Buffer.alloc(width*height*4);
  for(let i=0;i<width*height;i++)pixels.set([255,255,255,255],i*4);
  for(let y=2;y<5;y++)for(let x=2;x<5;x++)pixels.set([0,0,0,255],(y*width+x)*4);
  return {ensureAlpha(){return this;},raw(){return this;},
    toBuffer:async()=>({data:pixels,info:{width,height,channels:4}}),
    metadata:async()=>({format:'png',width,height,hasAlpha:true,space:'srgb'})};
}
function fixture(){
  const source=Buffer.from([1,2,3]);let saved=null;
  const store={getOwnedAsset:async({accountId})=>({id:'asset_a',accountId,bytes:source}),
    writeDerivative:async args=>{saved=args;return {id:'asset_b'};}};
  return {store,source,get saved(){return saved}};
}
const identity={accountId:'a',actorId:'au_a',installationId:'ia'};
test('background removal is executable via scoped asset store, produces new derivative',async()=>{
  const f=fixture();const handlers=createMediaHandlers({assetStore:f.store,sharp:mockSharp});
  const result=await handlers['media.image.background.remove']({assetId:'asset_a'},identity);
  assert.equal(result.ok,true);assert.equal(result.derivativeAssetId,'asset_b');assert.equal(result.sourceAssetId,'asset_a');
  assert.equal(f.saved.preservation,'retain_original');assert.deepEqual(f.source,Buffer.from([1,2,3]));
  assert.equal(f.saved.bytes[3],0);
});
test('missing actor/install identity rejects transformation',async()=>{
  const f=fixture();const handlers=createMediaHandlers({assetStore:f.store,sharp:mockSharp});
  await assert.rejects(handlers['media.image.background.remove']({assetId:'asset_a'},{accountId:'a'}),/trusted_execution_identity_required/);
});
test('generation tool connects to explicitly supplied provider, not a placeholder',async()=>{
  const calls=[];const handlers=createMediaHandlers({imageProvider:async(name,input,ctx)=>{calls.push({name,input,ctx});return {image_url:'https://example.invalid/img.png'};}});
  const out=await handlers['media.image.generate']({prompt:'drawing',userId:'forged'},identity);
  assert.equal(out.image_url,'https://example.invalid/img.png');
  assert.equal(calls[0].name,'imgx_generate_image');assert.equal(calls[0].input.userId,undefined);
  assert.equal(handlers['media.image.edit'],undefined);
});
