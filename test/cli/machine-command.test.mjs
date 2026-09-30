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
