import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sourceRoot = path.join(repoRoot, 'assets/brand/inneranimal-companions/v1');
const catalog = JSON.parse(readFileSync(path.join(sourceRoot, 'catalog.json'), 'utf8'));
const expectedIds = ['geaux', 'meaux', 'coder', 'architect', 'engineer', 'py'];

test('InnerAnimal companion catalog contains the six original characters in Geaux-first order', () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.defaultCompanionId, 'geaux');
  assert.deepEqual(catalog.companions.map((item) => item.id), expectedIds);
  assert.equal(new Set(catalog.companions.map((item) => item.sourceArchiveSha256)).size, 6);
});

test('all original companion animation states are valid transparent 256px APNG assets', () => {
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
      assert.ok(bytes.includes(Buffer.from('acTL')), `${id}/${state} has APNG animation control`);
      assert.ok(bytes.includes(Buffer.from('tRNS')) || bytes[25] === 6 || bytes[25] === 4,
        `${id}/${state} retains a transparency-capable RGBA/PNG encoding`);
      assert.equal(record.src, `animations/${id}-${state}.png`);
      assert.ok(record.frames > 0);
      totalStates += 1;
      totalFrames += record.frames;
    }
    for (const image of [manifest.avatar, manifest.icon, manifest.portrait]) {
      assert.ok(existsSync(path.join(folder, image)), `${id}/${image} portrait exists`);
    }
  }
  assert.equal(totalStates, 60);
  assert.equal(totalFrames, 345);
});
