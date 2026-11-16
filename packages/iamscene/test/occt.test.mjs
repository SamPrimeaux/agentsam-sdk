import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createOcctSceneAsset } from '../dist/src/node.js';

const binary = process.env.AGENTSAM_OCCT_BIN;
const roundedRect = (w, h, r, segments = 8) => {
  const points = [];
  for (const [cx, cy, start] of [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180], [w / 2 - r, -h / 2 + r, 270]]) {
    for (let i = 0; i <= segments; i += 1) { const a = (start + i * 90 / segments) * Math.PI / 180; points.push([cx + r * Math.cos(a), cy + r * Math.sin(a), 0]); }
  }
  return points;
};

test('canonical OCCT builds BREP and verified GLTF/STEP assets from scene feature history', { skip: !binary }, async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'iamscene-occt-'));
  try {
    const operations = [
      { id: 'part-profile', type: 'profile', points: roundedRect(42, 30, 4) },
      { id: 'part-body', type: 'extrude', profile: 'part-profile', vector: [0, 0, 3.5] },
    ];
    const result = await createOcctSceneAsset({ binary, projectId: 'iamscene-occt-test', elementId: 'part-body', operations, outputDir });
    assert.equal(result.engine, 'occt');
    assert.ok(result.volumeMm3 > 0);
    assert.equal(result.assets.length, 3);
    for (const asset of result.assets) {
      const file = path.join(outputDir, path.basename(asset.uri));
      assert.ok((await stat(file)).size > 100);
      assert.match(asset.sha256, /^[a-f0-9]{64}$/);
      assert.equal(asset.units, asset.role === 'presentation' ? 'm' : 'mm');
    }
    const gltf = JSON.parse(await readFile(path.join(outputDir, 'part-body.gltf'), 'utf8'));
    assert.equal(gltf.asset.version, '2.0');
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
