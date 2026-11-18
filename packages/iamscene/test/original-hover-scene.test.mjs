import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseSceneDocument } from '../dist/src/index.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../examples/original-circuit-hover');
const document = parseSceneDocument(fs.readFileSync(path.join(dir,'original-4341.iamscene.json'),'utf8'));

test('source meshes were converted into self-contained native scene assets',()=>{
  assert.equal(document.format,'iamscene');
  assert.deepEqual(document.scene.nodes.map(node=>node.name), ['Lightning','Battery','Bettery2','Cirquit']);
  assert.equal(document.assets.length,4);
  for(const asset of document.assets){
    const resolved=path.resolve(dir,asset.uri);
    assert.ok(resolved.startsWith(path.join(dir,'assets')+path.sep));
    const bytes=fs.readFileSync(resolved);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
    const gltf=JSON.parse(bytes.toString());
    assert.equal(gltf.asset.version,'2.0');
    assert.match(gltf.buffers[0].uri,/^data:application\/octet-stream;base64,/);
  }
});

test('native hover and release map to real track animations',()=>{
  assert.equal(document.animations.length,2);
  assert.deepEqual(document.interactions.map(i=>i.event),['pointerenter','pointerleave']);
  assert.deepEqual(document.animations.map(a=>a.id),['hover-ignite','hover-release']);
  for(const interaction of document.interactions){
    assert.equal(interaction.targetId,'battery-shell');
    assert.ok(document.animations.some(animation=>animation.id===interaction.action.animationId));
  }
  for(const animation of document.animations){
    assert.ok(animation.tracks.length>=3);
    assert.ok(animation.tracks.every(track=>document.scene.nodes.some(node=>node.id===track.targetId)));
  }
});

test('preview requires no Spline runtime or scene request',()=>{
  const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
  const script=fs.readFileSync(path.join(dir,'main.js'),'utf8');
  assert.doesNotMatch(html+script,/splinetool|spline\.design|splinecode/i);
});
