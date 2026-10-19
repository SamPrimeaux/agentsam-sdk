import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'protocol', 'cad', 'v2');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'schema-pack.manifest.json'), 'utf8'));
const publishedBase = 'https://schemas.inneranimalmedia.com/apps/cad-creator/schemas/v2/';

const records = new Map(manifest.modules.map((mod) => {
  assert.match(mod.path, /^[a-z0-9-]+\/[a-z0-9.-]+\.schema\.json$/);
  const body = JSON.parse(fs.readFileSync(path.join(source, mod.path), 'utf8'));
  return [mod.path, body];
}));

test('CAD v2 modular schema pack is complete and does not replace the base project contract', () => {
  assert.equal(manifest.schema, 'cad.schema-pack.v1');
  assert.equal(manifest.projectContract, 'cad.project.v2');
  assert.equal(manifest.status, 'additive-opt-in');
  assert.equal(manifest.modules.length, 22);
  assert.equal(records.size, 22);
  assert.equal(manifest.integrityAlgorithm, 'sha256');
  for (const mod of manifest.modules) {
    const bytes = fs.readFileSync(path.join(source, mod.path));
    assert.equal(bytes.length, mod.byteSize, mod.path + ': size drift');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), mod.sha256, mod.path + ': content digest drift');
  }
  const base = JSON.parse(fs.readFileSync(path.join(root, 'protocol/cad/cad.project.v2.schema.json')));
  assert.equal(base.properties.schema.const, 'cad.project.v2');
  assert.equal(base.$id, 'https://schemas.inneranimalmedia.com/apps/cad-creator/schemas/cad.project.v2.schema.json');
});

test('every schema declares stable identity, strict shape and complete references', () => {
  for (const [relative, schema] of records) {
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema', relative);
    assert.equal(schema.$id, publishedBase + relative, relative);
    assert.equal(schema.type, 'object', relative);
    assert.equal(schema.additionalProperties, false, relative);
    for (const property of schema.required ?? []) {
      assert.ok(Object.hasOwn(schema.properties ?? {}, property), relative + ': unknown required property ' + property);
    }
    const visit = (value) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== 'object') return;
      if (typeof value.$ref === 'string' && !value.$ref.startsWith('#')) {
        const [url,fragment] = value.$ref.split('#');
        const targetUri = new URL(url, schema.$id).href;
        assert.ok(targetUri.startsWith(publishedBase), relative + ': reference escapes schema pack');
        const target = targetUri.slice(publishedBase.length);
        assert.ok(records.has(target), relative + ': missing referenced module ' + target);
        if (fragment) {
          let node = records.get(target);
          for (const segment of fragment.replace(/^\//, '').split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'))) {
            assert.ok(node && typeof node === 'object' && Object.hasOwn(node, segment), relative + ': missing schema fragment ' + fragment);
            node = node[segment];
          }
        }
      }
      Object.values(value).forEach(visit);
    };
    visit(schema);
  }
});

test('critical domain modules have typed identity, feature history and source revision', () => {
  for (const [file,key] of [
    ['core/geometry-entity.schema.json','id'],
    ['core/geometry-feature.schema.json','dependencies'],
    ['core/geometry-constraint.schema.json','solverState'],
    ['core/geometry-relationship.schema.json','sourceIds'],
    ['modules/architecture.v1.schema.json','storeys'],
    ['interchange/ifc-mapping.schema.json','elementMappings'],
    ['presentation/scene.schema.json','sourceRevision'],
    ['presentation/walkthrough.schema.json','cameraPath'],
    ['validation/result.schema.json','layer']
  ]) {
    assert.ok(records.get(file).required.includes(key), file + ' must require ' + key);
  }
});
