import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProcedureCatalog, validateProcedureManifest } from '../../packages/primetech-procedures/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const procedureRoot = path.join(root, 'packages/primetech-procedures/procedures/cad.motor-bearing-end-plate');
const manifest = JSON.parse(fs.readFileSync(path.join(procedureRoot, 'procedure.json'), 'utf8'));

test('CAM procedure manifest validates under the PrimeTech contract', () => {
  const result = validateProcedureManifest(manifest);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('CAM procedure is discoverable in the shared PrimeTech catalog', () => {
  const catalog = createProcedureCatalog();
  const entry = catalog.list().find(item => item.id === 'cad.motor-bearing-end-plate');
  assert.ok(entry, 'procedure should be present in the shared catalog');
  assert.equal(entry.available, true, entry.error || 'procedure manifest/entrypoint is invalid');
  assert.equal(entry.version, '0.1.0');
  assert.equal(entry.effect, 'export');
});

test('CAM procedure keeps physical hardware disabled and requires operator review', () => {
  assert.equal(manifest.flags.physical_hardware, false);
  assert.equal(manifest.flags.requires_operator_review, true);
  assert.equal(manifest.flags.network, false);
  assert.equal(manifest.output_schema.properties.design_status.const, 'proposal_not_approved');
  assert.equal(manifest.output_schema.properties.toolpath.properties.status.const, 'UNVERIFIED');
});
