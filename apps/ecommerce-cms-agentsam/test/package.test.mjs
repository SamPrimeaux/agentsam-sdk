import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('ecommerce product doctor reports a complete portable source contract', () => {
  const out = execFileSync(process.execPath, ['bin/agentsam-ecommerce.mjs', 'doctor', '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  const receipt = JSON.parse(out);
  assert.equal(receipt.app_id, 'ecommerce-cms-agentsam');
  assert.equal(receipt.contract_consistent, true);
  assert.deepEqual(receipt.source.missing, []);
  assert.equal(receipt.source.frontend, true);
  assert.equal(receipt.source.provider_reference, true);
  assert.equal(receipt.source.donor_reference, true);
});

test('public package explicitly ships the preserved donor/reference inputs used by scaffold', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.publishConfig?.access, 'public');
  assert.ok(pkg.files.includes('reference/'));
  assert.ok(pkg.files.includes('providers/'));
  assert.ok(pkg.files.includes('frontend/'));
  assert.equal(typeof pkg.description, 'string');
  assert.ok(pkg.description.length > 40);
});
