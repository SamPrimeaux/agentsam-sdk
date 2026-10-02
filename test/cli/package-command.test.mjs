import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCliCommand } from '../../src/cli/command-catalog.js';
import {
  auditPackages,
  buildPublishPlan,
  verifyPackage,
} from '../../src/commands/package.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('package command is catalogued as package.audit', () => {
  const entry = getCliCommand('package');
  assert.equal(entry?.id, 'package');
  assert.equal(entry?.operation, 'package.audit');
});

test('package audit discovers explicit public package intent offline', async () => {
  const report = await auditPackages({ root, publicOnly: true, offline: true });
  const ide = report.packages.find((pkg) => pkg.name === '@inneranimalmedia/agentsam-ide');
  const goap = report.packages.find((pkg) => pkg.name === '@inneranimalmedia/agentsam-goap');

  assert.ok(ide);
  assert.equal(ide.public_intent, true);
  assert.equal(ide.registry.checked, false);
  assert.equal(ide.state, 'public_candidate_unchecked');

  assert.ok(goap);
  assert.equal(goap.public_intent, true);

  const settings = report.packages.find((pkg) => pkg.name === '@inneranimalmedia/agentsam-settings');
  assert.ok(settings);
  assert.equal(settings.state, 'public_manifest_incomplete');
  assert.ok(settings.raw_typescript_entrypoints.length > 0);
});

test('publish plan orders public internal dependencies before dependents', async () => {
  const plan = await buildPublishPlan({ root, offline: true });
  const byName = new Map(plan.publish_order.map((row) => [row.name, row.order]));

  if (byName.has('@inneranimalmedia/agentsam-assets-core') && byName.has('@inneranimalmedia/agentsam-content')) {
    assert.ok(
      byName.get('@inneranimalmedia/agentsam-assets-core') <
      byName.get('@inneranimalmedia/agentsam-content')
    );
  }
});

test('package verify proves the graduated agentsam-ide package', async () => {
  const report = await verifyPackage('@inneranimalmedia/agentsam-ide', {
    root,
    offline: true,
  });

  assert.equal(report.package.public_intent, true);
  assert.ok(report.gates.some((gate) => gate.gate === 'build'));
  assert.ok(report.gates.some((gate) => gate.gate === 'typecheck'));
  assert.ok(report.gates.some((gate) => gate.gate === 'test'));
  assert.ok(report.gates.some((gate) => gate.gate === 'pack'));
  assert.equal(report.ok, true);
  assert.deepEqual(report.blockers, []);
});
