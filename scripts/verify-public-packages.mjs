#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPackages, verifyPackage } from '../src/commands/package.js';

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

const failures = [];
console.log(`AgentSam public package verification · ${audit.packages.length} package(s) · ${offline ? 'offline' : 'registry-aware'}`);
for (const pkg of audit.packages) {
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
