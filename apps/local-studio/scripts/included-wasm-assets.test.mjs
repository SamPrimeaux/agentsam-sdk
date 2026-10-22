import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import { serveIncludedWasmAsset } from '../backend/worker/included-wasm-assets.js';

test('only scoped SamSketch WASM requests reach the hosted compressed asset', async () => {
  let count=0;
  const wasm=Uint8Array.from([0,97,115,109,1,0,0,0]);
  const packed=gzipSync(wasm);
  const env={ ASSETS:{ fetch: async (r) => { count++; assert.match(r.url,/\/samsketch\/assets\/opencascade\.full-abc\.wasm\.gz$/); return new Response(packed); } } };
  assert.equal(await serveIncludedWasmAsset(new Request('https://example.com/other/file.wasm'),env),null);
  assert.equal(count,0);
  const result=await serveIncludedWasmAsset(new Request('https://example.com/samsketch/assets/opencascade.full-abc.wasm'),env);
  assert.equal(result.status,200);
  assert.equal(result.headers.get('content-encoding'),'gzip');
  assert.equal(result.headers.get('content-type'),'application/wasm');
  assert.deepEqual(gunzipSync(Buffer.from(await result.arrayBuffer())),Buffer.from(wasm));
  assert.equal(count,1);
});
