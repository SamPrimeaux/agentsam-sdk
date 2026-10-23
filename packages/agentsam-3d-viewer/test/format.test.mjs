import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { inferModelFormat, SUPPORTED_MODEL_FORMATS } from '../src/format.js';

test('model format is inferred from a public URL without query/fragment noise', () => {
  assert.equal(inferModelFormat('https://assets.example.test/house.glb?v=7'), 'glb');
  assert.equal(inferModelFormat('/models/plan.gltf#preview'), 'gltf');
  assert.equal(inferModelFormat('/models/part.STL?download=1'), 'stl');
});

test('explicit format supports binary sources and rejects unknown formats', () => {
  assert.equal(inferModelFormat(new ArrayBuffer(16), 'glb'), 'glb');
  assert.deepEqual(SUPPORTED_MODEL_FORMATS, ['glb', 'gltf', 'stl']);
  assert.throws(() => inferModelFormat(new ArrayBuffer(16)), /agentsam_3d_format_required/);
  assert.throws(() => inferModelFormat('/models/part.obj'), /agentsam_3d_format_required/);
  assert.throws(() => inferModelFormat('/models/part.obj', 'obj'), /agentsam_3d_format_unsupported/);
});

test('viewer package exposes the shared viewport and model-mount entrypoints without bundling Three.js', async () => {
  const viewer = await import('../src/index.js');
  assert.equal(typeof viewer.createThreeViewport, 'function');
  assert.equal(typeof viewer.mountModelViewer, 'function');
});
