import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveCadChessAsset, serveCadChessAsset } from './cad-chess-assets.js';

const path = '/cad-creator/assets/chess/baroque/baroque_pawn_white_opt.glb';
const url = 'https://agentsam.inneranimalmedia.com' + path;

test('CAD model route restricts R2 proxy to the twelve original public pieces', () => {
  const kinds = ['pawn','knight','bishop','rook','queen','king'];
  for (const kind of kinds) for (const color of ['white','black']) {
    assert.equal(
      resolveCadChessAsset('/cad-creator/assets/chess/baroque/baroque_' + kind + '_' + color + '_opt.glb'),
      'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_' + kind + '_' + color + '_opt.glb'
    );
  }
  for (const invalid of [
    '/cad-creator/assets/chess/baroque/private.fcstd',
    '/cad-creator/assets/chess/baroque/../secrets',
    '/cad-creator/assets/chess/baroque/baroque_board_opt.glb',
    '/cad-creator/assets/chess/baroque/baroque_pawn_white_opt.glb/anything',
    '/cad-creator/assets/chess/baroque/baroque_king_black_opt.glb%2fsecret',
  ]) assert.equal(resolveCadChessAsset(invalid), null);
});

test('GET proxies only the allowlisted object and preserves model payload', async () => {
  const calls = [];
  const fetchAsset = async (source, init) => {
    calls.push({ source, init });
    return new Response(new Uint8Array([0x67,0x6c,0x54,0x46]), {
      headers: { 'content-type': 'model/gltf-binary', etag: '"model-v1"' },
    });
  };
  const response = await serveCadChessAsset(new Request(url), fetchAsset);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'model/gltf-binary');
  assert.equal(response.headers.get('etag'), '"model-v1"');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0x67,0x6c,0x54,0x46]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].source, 'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_pawn_white_opt.glb');
});

test('bad method/path, failed upstream, and unrelated path behave explicitly', async () => {
  assert.equal(await serveCadChessAsset(new Request('https://a.example/elsewhere')), null);
  assert.equal((await serveCadChessAsset(new Request(url,{method:'POST'}))).status,405);
  assert.equal((await serveCadChessAsset(new Request(url.replace('pawn','secrets')))).status,404);
  assert.equal((await serveCadChessAsset(new Request(url),async()=>new Response('fail',{status:403}))).status,502);
  assert.equal((await serveCadChessAsset(new Request(url),async()=>{throw Error('offline')})).status,502);
  const response=await serveCadChessAsset(new Request(url,{method:'HEAD'}),async()=>new Response(null,{headers:{etag:'"v1"'}}));
  assert.equal(response.status,200);
  assert.equal(await response.text(),'');
});
