#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentSamError } from '../packages/agentsam-errors/src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE = path.join(ROOT, 'apps', 'agentsam-go-worker');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-go-distribution-proof-'));
const artifacts = path.join(temp, 'artifacts');
const app = path.join(temp, 'newuser123');
fs.mkdirSync(artifacts, { recursive: true });
fs.mkdirSync(app, { recursive: true });

const npmUserConfig = path.join(temp, 'npmrc');
const npmGlobalConfig = path.join(temp, 'global-npmrc');
const npmCache = path.join(temp, 'npm-cache');

fs.writeFileSync(
  npmUserConfig,
  'registry=https://registry.npmjs.org/\nignore-scripts=true\n',
);
fs.writeFileSync(npmGlobalConfig, '');

const CLEAN_NPM_ENV = { ...process.env };

for (const key of Object.keys(CLEAN_NPM_ENV)) {
  if (
    /^npm_config_/i.test(key)
    || /^(npm_token|node_auth_token)$/i.test(key)
  ) {
    delete CLEAN_NPM_ENV[key];
  }
}

CLEAN_NPM_ENV.NPM_CONFIG_USERCONFIG = npmUserConfig;
CLEAN_NPM_ENV.NPM_CONFIG_GLOBALCONFIG = npmGlobalConfig;
CLEAN_NPM_ENV.NPM_CONFIG_CACHE = npmCache;

function run(command, args, options = {}) {
  const spawnOptions = {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  };

  if (command === 'npm') {
    spawnOptions.env = {
      ...CLEAN_NPM_ENV,
      ...(options.env || {}),
    };
  }

  const result = spawnSync(command, args, spawnOptions);
  if (result.status !== 0) {
    const operation = args[0] || command;
    const reason = command === 'npm' && operation === 'pack'
      ? 'pack_failed'
      : command === 'npm' && operation === 'install'
        ? 'distribution_install_failed'
        : 'distribution_smoke_failed';
    throw new AgentSamError({
      reason,
      stage: operation === 'pack' ? 'publish' : operation === 'install' ? 'install' : 'verify',
      feature: 'distribution.go',
      message: `${command} ${args.join(' ')} failed while verifying the clean-room distribution`,
      source: { kind: 'agentsam', name: 'verify-go-distribution' },
      native: {
        code: result.error?.code || null,
        exception_type: result.error?.name || null,
        exit_code: result.status,
        signal: result.signal || null,
        stdout: (result.stdout || '').slice(-6000),
        stderr: (result.stderr || '').slice(-6000),
      },
      details: { command, args },
      side_effect_state: 'unknown',
    }, { cause: result.error });
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
  servicePack.files.some((file) => file.path === 'runtime/go.sum'),
  true,
  'Go service tarball must contain runtime/go.sum',
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

const globalPrefix = path.join(temp, 'global-prefix');
const globalProject = path.join(temp, 'global-newuser123');
fs.mkdirSync(globalPrefix, { recursive: true });
fs.mkdirSync(globalProject, { recursive: true });

run('npm', [
  'install',
  '--global',
  '--ignore-scripts',
  '--prefix',
  globalPrefix,
  path.join(artifacts, sdkPack.filename),
  path.join(artifacts, servicePack.filename),
], { cwd: temp });

const globalCli = process.platform === 'win32'
  ? path.join(globalPrefix, 'agentsam.cmd')
  : path.join(globalPrefix, 'bin', 'agentsam');
const globalInspectResult = run(globalCli, ['go', 'inspect', '--json'], { cwd: globalProject });
const globalInspect = JSON.parse(globalInspectResult.stdout);

assert.equal(globalInspect.discovery.runtime.origin, 'installed_package');
assert.equal(globalInspect.discovery.distribution.package_name, '@inneranimalmedia/agentsam-go-worker');
assert.equal(globalInspect.discovery.distribution.package_version, servicePack.version);
assert.equal(globalInspect.productRoot.includes(ROOT), false, 'global install must not resolve to maintainer checkout');
assert.equal(globalInspect.stateRoot.includes('node_modules'), false, 'global install state root must not be package source');
assert.equal(path.resolve(globalInspect.stateRoot), fs.realpathSync(globalProject));

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
  global_install: {
    origin: globalInspect.discovery.runtime.origin,
    source_package: globalInspect.discovery.distribution.package_name,
    source_version: globalInspect.discovery.distribution.package_version,
    product_root: globalInspect.productRoot,
    state_root: globalInspect.stateRoot,
  },
  cloudflare_dry_run: null,
};

const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
if (accountId) {
  const dryRunResult = run(globalCli, [
    'go',
    '--cloudflare',
    'agentsam-go-worker',
    '--dry-run',
    '--account',
    accountId,
    '--json',
  ], { cwd: globalProject });
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
