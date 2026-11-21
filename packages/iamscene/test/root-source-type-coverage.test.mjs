import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createIAMSceneFormatRegistry } from '../dist/src/index.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = filename => JSON.parse(readFileSync(path.join(root,filename),'utf8'));
const types = read('contracts/source-types.v2.json');
const manifest = read('packages/iamscene/agentsam.package.json');

test('every IAMScene-registered file suffix has a canonical source-type identity', () => {
  const extensions = new Map();
  for (const format of types.formats)
    for (const ext of format.extensions || []) {
      const entries = extensions.get(ext.toLowerCase()) || [];
      entries.push(format.id);
      extensions.set(ext.toLowerCase(), entries);
    }
  const missing = [];
  for (const format of createIAMSceneFormatRegistry().list()) {
    for (const ext of format.extensions)
      if (!extensions.has(ext.toLowerCase())) missing.push(format.id + ':' + ext);
    if (format.operations['live-reference'] === 'implemented') {
      // Byte-level integrity tracking does NOT promote semantic import/export.
      if (['blend','ifc','usd','otio','dwg','e57'].includes(format.id)) {
        assert.equal(format.operations.import, 'unavailable', format.id);
        assert.equal(format.operations.export, 'unavailable', format.id);
        assert.equal(format.operations['round-trip'], 'unavailable', format.id);
      }
    }
  }
  assert.deepEqual(missing, [], 'add identity to contracts/source-types.v2.json; do not fake an adapter');
});

test('native IAM format identities and schema publishing stay aligned with the source catalog', () => {
  const scene = types.formats.find(f => f.id === 'model.iamscene');
  const geometry = types.formats.find(f => f.id === 'model.iamgeometry');
  assert.deepEqual(scene?.extensions, ['.iamscene', '.iamscene.json']);
  assert.deepEqual(geometry?.extensions, ['.iamgeometry']);
  assert.equal(scene?.family, 'model.scene');
  assert.equal(geometry?.family, 'model.geometry');
  assert.equal(geometry?.mediaTypes[0], 'application/vnd.inneranimalmedia.iamgeometry+json');
  assert.ok(manifest.commands.some(value => value.startsWith('iamscene formats')));
  const publisher = readFileSync(path.join(root, 'scripts/schema-registry/publish_package_schemas.py'), 'utf8');
  assert.match(publisher, /packages\/iamscene\/schema\/iamgeometry\.v1\.schema\.json.*iamgeometry\.schema\.json/);
  const schema = read('packages/iamscene/schema/iamgeometry.v1.schema.json');
  assert.equal(schema.$id, 'https://schemas.inneranimalmedia.com/packages/iamscene/v1/iamgeometry.schema.json');
});
