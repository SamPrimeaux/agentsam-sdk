import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSceneDocument, validateSceneDocument, sampleAnimation } from '../dist/src/index.js';

const exampleDir = path.dirname(fileURLToPath(import.meta.url)) + '/../examples/retrofuturistic-circuit-loop';
const scenePath = path.resolve(exampleDir, 'retrofuturistic-circuit-loop.iamscene.json');
const document = parseSceneDocument(await readFile(scenePath));

test('reference circuit scene is a portable native scene document, not a Spline payload', () => {
  assert.equal(validateSceneDocument(document).valid, true);
  assert.equal(document.metadata.id, 'retrofuturistic-circuit-loop');
  assert.equal(document.scene.nodes.length, 114);
  assert.equal(document.assets.length, 9);
  assert.equal(document.animations.length, 2);
  assert.equal(document.animations.reduce((count, animation) => count + animation.tracks.length, 0), 147);
  assert.equal(JSON.stringify(document).toLowerCase().includes('spline'), false);
});

test('battery, face and lightning retain OCCT feature histories and source assets', () => {
  for (const id of ['battery-body', 'battery-face', 'lightning']) {
    const node = document.scene.nodes.find(item => item.id === id);
    assert.equal(node.geometry.type, 'occt');
    assert.equal(node.geometry.units, 'mm');
    assert.ok(node.geometry.operations.length >= 2);
    assert.equal(node.assetRef, `${id}-gltf`);
    for (const format of ['gltf', 'step', 'brep']) {
      assert.ok(document.assets.some(asset => asset.id === `${id}-${format}`));
    }
  }
});

test('all reference-scene asset hashes and file references resolve', async () => {
  for (const asset of document.assets) {
    const file = path.resolve(exampleDir, asset.uri.replace(/^\.\//, ''));
    const info = await stat(file);
    assert.ok(info.size > 100, asset.id);
    const bytes = await readFile(file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.id);
  }
});

test('the circuit animation is time-addressable and has finite samples across its loop', () => {
  const animation = document.animations.find(item => item.id === 'circuit-loop');
  assert.ok(animation);
  for (const time of [0, 0.5, 1.4, 2.5, 4, 5.8, 7.4, 8.5, 16]) {
    for (const sample of sampleAnimation(animation, time)) {
      if (typeof sample.value === 'number') assert.ok(Number.isFinite(sample.value));
      if (Array.isArray(sample.value)) assert.ok(sample.value.every(Number.isFinite));
    }
  }
});
