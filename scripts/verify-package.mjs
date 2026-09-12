import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const identity = readJson('packages/identity/package.json');
const capabilityManifest = readJson('protocol/capabilities/manifest.json');
const presetCatalog = readJson('protocol/presets/catalog.json');

assert.equal(pkg.name, '@inneranimalmedia/agentsam-sdk');
assert.equal(pkg.version, lock.version, 'package.json and package-lock.json versions must match');
assert.equal(pkg.version, lock.packages?.['']?.version, 'root lock package version must match');
assert.equal(pkg.version, identity.version, 'identity workspace version must track the root SDK');
assert.equal(pkg.version, lock.packages?.['packages/identity']?.version, 'identity lock version must match');
assert.equal(pkg.dependencies?.[pkg.name], undefined, 'SDK must never depend on itself');
assert.equal(lock.packages?.[`node_modules/${pkg.name}`], undefined, 'lockfile must not contain nested SDK self-install');
assert.equal(pkg.scripts?.postinstall, undefined, 'root SDK install must be side-effect free');

for (const [exportKey, target] of Object.entries(pkg.exports || {})) {
  assert.ok(target, `missing public export ${exportKey}`);
  assert.ok(existsSync(join(root, target)), `public export target missing: ${target}`);
}

assert.equal(pkg.bin?.agentsam, 'bin/agentsam');
assert.equal(
  pkg.bin?.['agentsam-sdk'],
  'bin/agentsam',
  'package-name bin alias is required so `npx @inneranimalmedia/agentsam-sdk` can select an executable',
);
const agentsamBin = readFileSync(join(root, pkg.bin.agentsam), 'utf8');
assert.ok(agentsamBin.startsWith('#!/usr/bin/env node'), 'agentsam bin must be directly executable by Node');
assert.match(agentsamBin, /import ['"]\.\.\/src\/cli\.js['"];/, 'agentsam bin wrapper must delegate to the canonical CLI entry');
assert.ok(pkg.files?.includes('src'), 'published files must include src');
assert.ok(pkg.files?.includes('packages/identity'), 'published files must include identity workspace');
assert.ok(pkg.files?.includes('AGENTSAM.md') && existsSync(join(root, 'AGENTSAM.md')), 'published files must include the stable AgentSam runtime contract');
assert.equal(identity.private, true, 'identity is distributed through the root SDK, not separately published');
for (const file of ['services/knowledge/package.json', 'services/knowledge/package-lock.json']) {
  assert.ok(pkg.files.includes(file) && existsSync(join(root, file)), `missing knowledge service runtime asset: ${file}`);
}

assert.equal(capabilityManifest.schema_version, 1, 'capability manifest schema version must be 1');
assert.equal(capabilityManifest.package, pkg.name, 'capability manifest package must match root package');
for (const [id, capability] of Object.entries(capabilityManifest.capabilities || {})) {
  assert.equal(capability.id, id, `capability key/id mismatch: ${id}`);
  assert.ok(['capability', 'agent_primitive'].includes(capability.kind), `invalid capability kind: ${id}`);
  assert.equal(typeof capability.model_required, 'boolean', `capability model_required missing: ${id}`);
}
for (const [presetId, preset] of Object.entries(presetCatalog.presets || {})) {
  assert.equal(preset.id, presetId, `preset key/id mismatch: ${presetId}`);
  for (const id of preset.capabilities || []) {
    assert.ok(capabilityManifest.capabilities[id], `preset ${presetId} references unknown capability ${id}`);
  }
}
for (const [addonId, addon] of Object.entries(presetCatalog.addons || {})) {
  assert.equal(addon.id, addonId, `addon key/id mismatch: ${addonId}`);
  for (const id of addon.capabilities || []) {
    assert.ok(capabilityManifest.capabilities[id], `addon ${addonId} references unknown capability ${id}`);
  }
}

console.log(`verify-package OK ${pkg.name}@${pkg.version}`);
