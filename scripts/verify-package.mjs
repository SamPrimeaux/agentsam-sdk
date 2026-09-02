import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const identity = readJson('packages/identity/package.json');

assert.equal(pkg.name, '@inneranimalmedia/agentsam-sdk');
assert.equal(pkg.version, lock.version, 'package.json and package-lock.json versions must match');
assert.equal(pkg.version, lock.packages?.['']?.version, 'root lock package version must match');
assert.equal(pkg.version, identity.version, 'identity workspace version must track root alpha');
assert.equal(pkg.version, lock.packages?.['packages/identity']?.version, 'identity lock version must match');
assert.equal(pkg.dependencies?.[pkg.name], undefined, 'SDK must never depend on itself');
assert.equal(lock.packages?.[`node_modules/${pkg.name}`], undefined, 'lockfile must not contain nested SDK self-install');
assert.equal(pkg.scripts?.postinstall, undefined, 'root SDK install must be side-effect free');

for (const exportKey of ['./git-context', './bridge-client', './local/sqlite', './mini', './merkle', './security', './knowledge']) {
  const target = pkg.exports?.[exportKey];
  assert.ok(target, `missing public export ${exportKey}`);
  assert.ok(existsSync(join(root, target)), `public export target missing: ${target}`);
}

assert.equal(pkg.bin?.agentsam, 'src/cli.js');
assert.equal(
  pkg.bin?.['agentsam-sdk'],
  'src/cli.js',
  'package-name bin alias is required so `npx @inneranimalmedia/agentsam-sdk` can select an executable',
);
assert.ok(readFileSync(join(root, pkg.bin.agentsam), 'utf8').startsWith('#!/usr/bin/env node'));
assert.ok(pkg.files?.includes('src'), 'published files must include src');
assert.ok(pkg.files?.includes('packages/identity'), 'published files must include identity workspace');

console.log(`verify-package OK ${pkg.name}@${pkg.version}`);
