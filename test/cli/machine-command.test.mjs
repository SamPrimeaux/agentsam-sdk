import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { getCliCommand } from '../../src/cli/command-catalog.js';
import { resolveMachineBinary } from '../../src/commands/machine-binary.js';
import {
  installManagedMachine,
  machineRuntimeStatus,
} from '../../src/commands/machine-runtime.js';

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
  assert.equal(fs.existsSync(path.join(root, 'src/commands/machine-runtime.js')), true);
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

test('managed Machine runtime outranks explicit override and PATH fallbacks', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-machine-managed-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));

  const agentsamHome = path.join(temp, '.agentsam');
  const binaryName = process.platform === 'win32' ? 'agentsam-machine.exe' : 'agentsam-machine';
  const binary = path.join(
    agentsamHome,
    'runtimes',
    'machine',
    'versions',
    '0.1.0',
    'bin',
    binaryName,
  );

  fs.mkdirSync(path.dirname(binary), { recursive: true });
  fs.writeFileSync(
    binary,
    process.platform === 'win32'
      ? '@echo agentsam-machine 0.1.0\r\n'
      : '#!/usr/bin/env sh\necho "agentsam-machine 0.1.0"\n',
  );
  if (process.platform !== 'win32') fs.chmodSync(binary, 0o755);

  const statePath = path.join(agentsamHome, 'runtimes', 'machine', 'current.json');
  fs.writeFileSync(statePath, JSON.stringify({
    schema: 'agentsam.machine.runtime.v1',
    manager: 'agentsam',
    package: 'agentsam-machine-cli',
    current_version: '0.1.0',
    source: 'crates.io',
    installed_at_iso: '2026-10-02T00:00:00.000Z',
  }));

  const override = path.join(temp, 'override-machine');
  fs.writeFileSync(override, 'override');

  const env = {
    ...process.env,
    AGENTSAM_HOME: agentsamHome,
    AGENTSAM_MACHINE_BIN: override,
  };

  const resolution = resolveMachineBinary(env);
  assert.equal(resolution.kind, 'binary');
  assert.equal(resolution.source, 'managed-runtime');
  assert.equal(resolution.path, binary);

  const status = machineRuntimeStatus(env);
  assert.equal(status.installed, true);
  assert.equal(status.current_version, '0.1.0');
  assert.equal(status.binary, binary);
});

test('managed Machine install uses registry package and writes user-level state', (t) => {
  if (process.platform === 'win32') return;

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-machine-install-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));

  const fakeBin = path.join(temp, 'fake-bin');
  const agentsamHome = path.join(temp, '.agentsam');
  fs.mkdirSync(fakeBin, { recursive: true });

  const cargo = path.join(fakeBin, 'cargo');
  fs.writeFileSync(
    cargo,
    '#!/usr/bin/env node\n' +
      "const fs=require('fs'); const path=require('path'); const a=process.argv.slice(2);\n" +
      "if(a[0]==='search'){ console.log('agentsam-machine-cli = \\\"0.1.0\\\" # test'); process.exit(0); }\n" +
      "if(a[0]==='install'){ const r=a[a.indexOf('--root')+1]; fs.mkdirSync(path.join(r,'bin'),{recursive:true}); " +
      "const b=path.join(r,'bin','agentsam-machine'); fs.writeFileSync(b,'#!/usr/bin/env sh\\necho \\\"agentsam-machine 0.1.0\\\"\\n'); fs.chmodSync(b,0o755); process.exit(0); }\n" +
      'process.exit(2);\n',
  );
  fs.chmodSync(cargo, 0o755);

  const env = {
    ...process.env,
    AGENTSAM_HOME: agentsamHome,
    PATH: fakeBin + path.delimiter + process.env.PATH,
  };

  const result = installManagedMachine({ env });
  assert.equal(result.version, '0.1.0');
  assert.equal(result.changed, true);
  assert.equal(fs.existsSync(result.binary), true);
  assert.equal(fs.existsSync(result.alias), true);

  const status = machineRuntimeStatus(env);
  assert.equal(status.installed, true);
  assert.equal(status.current_version, '0.1.0');

  const resolution = resolveMachineBinary(env);
  assert.equal(resolution.source, 'managed-runtime');
  assert.equal(resolution.path, result.binary);
});
