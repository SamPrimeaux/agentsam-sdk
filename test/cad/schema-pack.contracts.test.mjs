import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';

const root = path.resolve(import.meta.dirname, '../../protocol/cad/v2');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'schema-pack.manifest.json')));
const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: false });
for (const m of manifest.modules) {
  const bytes = fs.readFileSync(path.join(root, m.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), m.sha256);
  const schema = JSON.parse(bytes);
  assert.equal(schema.$id, m.uri);
  ajv.addSchema(schema);
}
const validator = (p) => {
  const m = manifest.modules.find((item) => item.path === p);
  assert.ok(m, 'missing contract ' + p);
  return ajv.getSchema(m.uri);
};

test('28 release-pinned schemas compile without weakening Ajv strict mode', () => {
  assert.equal(manifest.modules.length, 28);
  for (const m of manifest.modules) assert.equal(typeof validator(m.path), 'function');
  assert.ok(manifest.publicBaseUri.includes('/releases/'));
});

test('completed deliverables require hash, artifact and execution receipt', () => {
  const check = validator('validation/deliverable-manifest.schema.json');
  const draft = {
    schema: 'cad.delivery-manifest.v1', id: 'del_1',
    projectId: 'project_1', projectRevision: 1, profile: 'architecture.initial-sd',
    outputs: [{ id: 'drawing_1', kind: 'drawing.plan', format: 'pdf',
      required: true, sourceRevision: 1, state: 'planned' }]
  };
  assert.equal(check(draft), true, JSON.stringify(check.errors));
  const complete = structuredClone(draft);
  complete.outputs[0].state = 'completed';
  assert.equal(check(complete), false);
  Object.assign(complete.outputs[0], { outputId: 'output_1',
    artifactUri: 'r2://artifacts/a.pdf', sha256: 'a'.repeat(64), receiptId: 'receipt_1' });
  assert.equal(check(complete), true, JSON.stringify(check.errors));
});

test('reference model requires a valid content hash', () => {
  const check = validator('interchange/reference-model.schema.json');
  const model = { id: 'ref_1', sourceUri: 'r2://assets/reference.ifc',
    format: 'ifc', sha256: 'bad', sourceRevision: 1,
    referenceFrameId: 'project_frame', attachmentPolicy: 'read-only' };
  assert.equal(check(model), false);
  model.sha256 = 'a'.repeat(64);
  assert.equal(check(model), true, JSON.stringify(check.errors));
});

test('robotics module has typed links and joints', () => {
  const check = validator('modules/robotics.v1.schema.json');
  const model = { schema: 'cad.module.robotics.v1', version: 1,
    robots: [{ id: 'robot_1', baseFrameId: 'world',
      rootLinkId: 'base', links: [{ id: 'base', entityIds: ['body'] }], joints: [] }] };
  assert.equal(check(model), true, JSON.stringify(check.errors));
  model.robots[0].links[0].entityIds = [42];
  assert.equal(check(model), false);
});
