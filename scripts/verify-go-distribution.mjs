#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE = path.join(ROOT, 'apps', 'agentsam-go-worker');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-go-distribution-proof-'));
const artifacts = path.join(temp, 'artifacts');
const app = path.join(temp, 'newuser123');
fs.mkdirSync(artifacts, { recursive: true });
fs.mkdirSync(app, { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    const error = new Error('distribution_command_failed: ' + command + ' ' + args.join(' '));
    error.detail = {
      status: result.status,
      stdout: (result.stdout || '').slice(-6000),
      stderr: (result.stderr || '').slice(-6000),
    };
    throw error;
  }
  return result;
}

function pack(cwd) {
  const result = run('npm', [
    'pack',
    '--json',
    '--ignore-scripts',
    '--pack-destination',
    artifacts,
  ], { cwd });
  return JSON.parse(result.stdout)[0];
}

const sdkPack = pack(ROOT);
const servicePack = pack(SERVICE);

assert.equal(sdkPack.name, '@inneranimalmedia/agentsam-sdk');
assert.equal(servicePack.name, '@inneranimalmedia/agentsam-go-worker');
assert.equal(
  sdkPack.files.some((file) => file.path.startsWith('apps/agentsam-go-worker/')),
  false,
  'root SDK tarball must not absorb the Go service authoring tree',
);
assert.equal(
  servicePack.files.some((file) => file.path === 'runtime/go.mod'),
  true,
  'Go service tarball must contain runtime/go.mod',
);
assert.equal(
  servicePack.files.some((file) => file.path === 'worker/src/index.js'),
  true,
  'Go service tarball must contain Worker adapter',
);
assert.equal(
  servicePack.files.some((file) => file.path.includes('.agentsam-build') || file.path.includes('.agentsam-built')),
  false,
  'Go service tarball must not leak generated build provenance',
);

run('npm', ['init', '-y'], { cwd: app });
run('npm', [
  'install',
  '--ignore-scripts',
  path.join(artifacts, sdkPack.filename),
  path.join(artifacts, servicePack.filename),
], { cwd: app });

const cli = path.join(app, 'node_modules', '.bin', 'agentsam');
const inspectResult = run(cli, ['go', 'inspect', '--json'], { cwd: app });
const inspect = JSON.parse(inspectResult.stdout);

assert.equal(inspect.discovery.runtime.origin, 'installed_package');
assert.equal(inspect.discovery.distribution.package_name, '@inneranimalmedia/agentsam-go-worker');
assert.equal(inspect.discovery.distribution.package_version, servicePack.version);
assert.equal(inspect.productRoot.includes(ROOT), false, 'installed service must not resolve to maintainer checkout');
assert.equal(inspect.stateRoot.includes('node_modules'), false, 'state root must not be package source');
assert.equal(path.resolve(inspect.stateRoot), fs.realpathSync(app));
assert.equal(fs.existsSync(path.join(inspect.productRoot, '.agentsam')), false);

const receipt = {
  schema: 'agentsam.go-distribution-proof.v1',
  ok: true,
  temp_root: temp,
  sdk: {
    name: sdkPack.name,
    version: sdkPack.version,
    filename: sdkPack.filename,
    files: sdkPack.entryCount,
  },
  service: {
    name: servicePack.name,
    version: servicePack.version,
    filename: servicePack.filename,
    files: servicePack.entryCount,
  },
  inspect: {
    origin: inspect.discovery.runtime.origin,
    source_package: inspect.discovery.distribution.package_name,
    source_version: inspect.discovery.distribution.package_version,
    product_root: inspect.productRoot,
    state_root: inspect.stateRoot,
  },
  cloudflare_dry_run: null,
};

const accountId = String(process.env.AGENTSAM_GO_DRY_RUN_ACCOUNT || '').trim();
if (accountId) {
  const dryRunResult = run(cli, [
    'go',
    '--cloudflare',
    'agentsam-go-worker',
    '--dry-run',
    '--account',
    accountId,
    '--json',
  ], { cwd: app });
  const dryRun = JSON.parse(dryRunResult.stdout);
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.mode, 'self_host');
  assert.equal(dryRun.discovery.runtime.origin, 'installed_package');
  assert.equal(dryRun.build.source.identity, 'npm:@inneranimalmedia/agentsam-go-worker@' + servicePack.version);
  assert.equal(dryRun.container?.ok, true);
  assert.equal(dryRun.container?.architecture, 'amd64');
  assert.notEqual(dryRun.container?.user, 'root');
  assert.equal(dryRun.container?.probe?.checks?.source_identity, true);
  assert.equal(dryRun.deploy?.dryRunValidated, true);
  assert.equal(dryRun.deploy?.receipt?.skipped_deploy, false);
  assert.equal(dryRun.deploy?.registry?.remote, false);
  assert.equal(dryRun.deploy?.registry?.reason, 'self_host_registry_isolated');
  assert.equal(fs.existsSync(path.join(dryRun.discovery.runtime.productRoot, '.agentsam')), false);
  assert.equal(fs.existsSync(path.join(dryRun.state_root, '.agentsam')), true);
  receipt.cloudflare_dry_run = {
    ok: true,
    account_id: dryRun.cloudflare?.account?.id || null,
    auth_type: dryRun.cloudflare?.auth_type || null,
    source_identity: dryRun.build.source.identity,
    container_architecture: dryRun.container.architecture,
    registry_mode: dryRun.deploy.receipt.registry_mode,
    registry_reason: dryRun.deploy.registry.reason,
  };
}

process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
