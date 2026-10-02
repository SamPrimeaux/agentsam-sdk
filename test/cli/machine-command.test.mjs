import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCliCommand } from '../../src/cli/command-catalog.js';
import { resolveMachineBinary } from '../../src/commands/machine-binary.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('machine command is catalogued as machine.inspect', () => {
  const entry = getCliCommand('machine');
  assert.equal(entry?.id, 'machine');
  assert.equal(entry?.operation, 'machine.inspect');
  assert.equal(entry?.common, true);
});

test('machine crate + CLI sources exist for graduation', () => {
  assert.equal(fs.existsSync(path.join(root, 'native/agentsam-machine/Cargo.toml')), true);
  assert.equal(fs.existsSync(path.join(root, 'native/agentsam-machine/cli/src/main.rs')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/commands/machine.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/commands/machine-binary.js')), true);
});

test('resolveMachineBinary finds crate binary or cargo fallback in this repo', () => {
  const resolution = resolveMachineBinary();
  assert.notEqual(resolution.kind, 'missing');
  if (resolution.kind === 'binary') {
    assert.equal(fs.existsSync(resolution.path), true);
  } else {
    assert.equal(resolution.kind, 'cargo');
    assert.equal(fs.existsSync(resolution.manifest), true);
  }
});

test('machine crate carries a synchronized publish-safe source-type contract', () => {
  const authority = fs.readFileSync(path.join(root, 'contracts/source-types.v1.json'), 'utf8');
  const vendored = fs.readFileSync(
    path.join(root, 'native/agentsam-machine/core/contracts/source-types.v1.json'),
    'utf8',
  );
  assert.equal(vendored, authority);
});

test('machine CLI crate has a crates.io-safe versioned core dependency', () => {
  const manifest = fs.readFileSync(
    path.join(root, 'native/agentsam-machine/cli/Cargo.toml'),
    'utf8',
  );
  assert.match(
    manifest,
    /agentsam-machine-core\s*=\s*\{\s*version\s*=\s*"0\.1\.0"\s*,\s*path\s*=\s*"\.\.\/core"\s*\}/,
  );
});
