import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sourceRoot = path.join(repoRoot, 'assets/brand/inneranimal-companions/v1');
const catalog = JSON.parse(readFileSync(path.join(sourceRoot, 'catalog.json'), 'utf8'));
const expectedIds = ['geaux', 'meaux', 'coder', 'architect', 'engineer', 'py', 'bella'];

function apngFrameCount(bytes) {
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'acTL') return bytes.readUInt32BE(offset + 8);
    offset += length + 12;
  }
  return 0;
}

test('InnerAnimal companion catalog contains the six founding characters plus Bella in Geaux-first order', () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.defaultCompanionId, 'geaux');
  assert.deepEqual(catalog.companions.map((item) => item.id), expectedIds);
  assert.equal(new Set(catalog.companions.map((item) => item.sourceArchiveSha256)).size, 7);
  const bellaEntry = catalog.companions.find((item) => item.id === 'bella');
  assert.equal(bellaEntry.sourcePackage, 'InnerAnimal-Bella-v1.0.0.zip');
  assert.equal(bellaEntry.releasePackage, 'InnerAnimal-Bella-v1.1.0.zip');
});

test('all built-in companion runtime states are transparent 256px APNG assets', () => {
  let totalStates = 0;
  let totalFrames = 0;
  for (const id of expectedIds) {
    const folder = path.join(sourceRoot, id);
    const manifest = JSON.parse(readFileSync(path.join(folder, 'companion.json'), 'utf8'));
    assert.equal(manifest.id, id);
    assert.equal(manifest.visualApproval, 'pending', 'source art is not silently marked approved');
    assert.equal(manifest.structuralValidation.ok, true);
    assert.equal(Object.keys(manifest.states).length, 10);
    for (const [state, record] of Object.entries(manifest.states)) {
      const file = path.join(folder, record.src);
      assert.ok(existsSync(file), `${id}/${state} source APNG exists`);
      const bytes = readFileSync(file);
      assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(bytes.readUInt32BE(16), 256, `${id}/${state} frame width`);
      assert.equal(bytes.readUInt32BE(20), 256, `${id}/${state} frame height`);
      assert.equal(bytes[25], 6, `${id}/${state} is RGBA with alpha`);
      assert.ok(bytes.includes(Buffer.from('acTL')), `${id}/${state} has APNG animation control`);
      assert.equal(apngFrameCount(bytes), record.frames, `${id}/${state} APNG frame count`);
      assert.match(record.src, new RegExp(`^animations/${id}-[a-z0-9-]+\\.png$`));
      assert.ok(record.frames > 0);
      totalStates += 1;
      totalFrames += record.frames;
    }
    for (const image of [manifest.avatar, manifest.icon, manifest.portrait]) {
      assert.ok(existsSync(path.join(folder, image)), `${id}/${image} portrait exists`);
    }
  }
  assert.equal(totalStates, 70);
  assert.equal(totalFrames, 425);
});

test('Bella preserves all 16 source keyframes and exposes 16 eight-frame gallery animations', () => {
  const folder = path.join(sourceRoot, 'bella');
  const manifest = JSON.parse(readFileSync(path.join(folder, 'companion.json'), 'utf8'));
  assert.equal(manifest.version, '1.1.0');
  assert.equal(manifest.sourcePackage, 'InnerAnimal-Bella-v1.0.0.zip');
  assert.equal(manifest.releasePackage, 'InnerAnimal-Bella-v1.1.0.zip');
  assert.equal(manifest.animationFrameCount, 128);
  assert.equal(manifest.runtimeStateCount, 10);
  assert.equal(manifest.galleryStates.length, 16);
  assert.equal(new Set(manifest.galleryStates.map((state) => state.id)).size, 16);
  for (const state of manifest.galleryStates) {
    const file = path.join(folder, state.src);
    assert.ok(existsSync(file), `Bella gallery APNG ${state.id} exists`);
    const bytes = readFileSync(file);
    assert.equal(bytes.readUInt32BE(16), 256);
    assert.equal(bytes.readUInt32BE(20), 256);
    assert.equal(bytes[25], 6);
    assert.equal(apngFrameCount(bytes), 8);
    assert.equal(state.frames, 8);
    assert.equal(state.fps, 6);
  }
  const keyframes = ['idle', 'attentive', 'blink', 'curious', 'head-tilt', 'asking', 'thinking', 'waiting', 'voice-headset', 'working', 'tail-wag', 'success', 'welcome', 'alert-error', 'resting', 'sleeping'];
  for (const state of keyframes) assert.ok(existsSync(path.join(folder, 'keyframes', `bella-${state}.png`)), `Bella source keyframe ${state} retained`);
  assert.equal(manifest.states.attention.src, 'animations/bella-attentive.png');
  assert.equal(manifest.states.signature.src, 'animations/bella-tail-wag.png');
  assert.equal(manifest.states.error.src, 'animations/bella-alert-error.png');
});
