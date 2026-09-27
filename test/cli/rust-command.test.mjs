import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCliCommand } from '../../src/cli/command-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('rust/wasm command aliases resolve to one catalog authority', () => {
  const rust = getCliCommand('rust');
  assert.equal(rust?.id, 'rust');
  assert.equal(getCliCommand('wasm')?.id, 'rust');
  assert.equal(getCliCommand('rapid-rust')?.id, 'rust');
});

test('rapid rust root bin and native crate ship in source tree', () => {
  assert.equal(fs.existsSync(path.join(root, 'bin/agentsam-rapid-rust')), true);
  assert.equal(fs.existsSync(path.join(root, 'packages/agentsam-rapid-rust/Cargo.toml')), true);
  assert.equal(fs.existsSync(path.join(root, 'scripts/build_rapid_rust_cli.py')), true);
});
