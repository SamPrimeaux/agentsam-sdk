#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPackages, buildPublishPlan, verifyPackage } from '../src/commands/package.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const offline = !process.argv.includes('--online');
const audit = await auditPackages({ root, publicOnly: true, offline });
const structural = audit.packages.filter((pkg) => pkg.structural_blockers?.length);

if (structural.length) {
  console.error(`Public package structural gate FAILED (${structural.length})`);
  for (const pkg of structural) {
    console.error(`  ${pkg.name}@${pkg.version} · ${pkg.structural_blockers.join('; ')}`);
  }
  process.exit(1);
}

// Package builds depend on sibling packages' generated declarations and files.
// Alphabetical verification attempts consumers before their dependencies and
// invents avoidable build failures. Reuse the canonical publish dependency DAG.
const publishPlan = await buildPublishPlan({ root, offline });
const packagesByName = new Map(audit.packages.map((pkg) => [pkg.name, pkg]));
const ordered = publishPlan.publish_order.map(({ name }) => packagesByName.get(name));
if (ordered.length !== audit.packages.length || ordered.some((pkg) => !pkg)) {
  throw new Error('public_package_verification_order_incomplete');
}

const failures = [];
console.log(`AgentSam public package verification · ${ordered.length} package(s) · ${offline ? 'offline' : 'registry-aware'} · dependency order`);
for (const pkg of ordered) {
  const result = await verifyPackage(pkg.name, { root, offline });
  if (result.ok) {
    const gates = result.gates.map((gate) => gate.gate).join(', ') || 'pack';
    console.log(`  READY ${pkg.name}@${pkg.version} · ${gates}`);
  } else {
    failures.push(result);
    console.error(`  BLOCKED ${pkg.name}@${pkg.version} · ${result.blockers.join('; ')}`);
  }
}

if (failures.length) {
  console.error(`Public package verification FAILED: ${failures.length}/${audit.packages.length}`);
  process.exit(1);
}
console.log(`Public package verification PASS: ${audit.packages.length}/${audit.packages.length}`);
