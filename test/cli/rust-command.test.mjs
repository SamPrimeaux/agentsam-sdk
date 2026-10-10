import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCliCommand } from '../../src/cli/command-catalog.js';
import { spawnSync } from 'node:child_process';

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

test('rapid rust native help keeps the public agentsam rust command name', () => {
  const source = fs.readFileSync(path.join(root, 'packages/agentsam-rapid-rust/src/main.rs'), 'utf8');
  assert.match(source, /bin_name = "agentsam rust"/);
});

test('bare rust help is successful and never invents HTTP 500',()=>{
  const result=spawnSync(process.execPath,['src/cli.js','rust'],{cwd:root,encoding:'utf8',timeout:25000});
  assert.equal(result.status,0,`stderr: ${result.stderr}`);
  assert.match(result.stdout,/agentsam rust/);
  assert.match(result.stdout,/--help/);
  assert.doesNotMatch(result.stderr,/HTTP 500|internal · inspect_error/);
});


test('rust status is an alias of the real native doctor command', () => {
  const source=fs.readFileSync(path.join(root,'src/commands/rust.js'),'utf8');
  assert.match(source,/argv\[0\] === 'status'/);
  assert.match(source,/\['doctor', \.\.\.argv\.slice\(1\)\]/);
  const result=spawnSync(process.execPath,['src/cli.js','rust'],{cwd:root,encoding:'utf8',timeout:25000});
  assert.equal(result.status,0);
  assert.match(result.stdout,/agentsam rust doctor/);
});
