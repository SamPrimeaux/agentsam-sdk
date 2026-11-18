import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseSceneDocument, sampleAnimationTrack, validateSceneDocument } from '../dist/src/index.js';

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

test('original circuit propagation is time-addressable and hover-triggered',()=>{
  assert.equal(document.animations.length,1);
  assert.deepEqual(document.interactions.map(i=>i.event),['pointerenter','click']);
  assert.deepEqual(document.animations.map(a=>a.id),['circuit-expansion']);
  for(const interaction of document.interactions){
    assert.equal(interaction.targetId,'battery-shell');
    assert.ok(document.animations.some(animation=>animation.id===interaction.action.animationId));
  }
  const material = document.materials.find(material=>material.id==='circuit-traces');
  assert.equal(material.radialReveal.initialRadius, 50);
  assert.equal(document.animations[0].loop, true);
  const revealTrack = document.animations[0].tracks.find(track=>track.property==='material.revealRadius');
  assert.ok(revealTrack);
  assert.equal(revealTrack.keyframes[0].value, 50);
  assert.ok(revealTrack.keyframes.some(frame=>frame.value>230));
  assert.equal(sampleAnimationTrack(revealTrack,0),50);
  assert.ok(sampleAnimationTrack(revealTrack,2.5)>230);
  assert.ok(sampleAnimationTrack(revealTrack,3.9)<100);
  for(const animation of document.animations){
    assert.ok(animation.tracks.length>=1);
    assert.ok(animation.tracks.every(track=>document.scene.nodes.some(node=>node.id===track.targetId)));
  }
});

test('preview requires no Spline runtime or scene request',()=>{
  const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
  const script=fs.readFileSync(path.join(dir,'main.js'),'utf8');
  assert.doesNotMatch(html+script,/splinetool|spline\.design|splinecode/i);
});

test('invalid native radial reveal settings are rejected by the canonical document schema',()=>{
  const invalid = structuredClone(document);
  invalid.materials.find(material=>material.id==='circuit-traces').radialReveal.initialRadius = -1;
  assert.equal(validateSceneDocument(invalid).valid, false);
});
