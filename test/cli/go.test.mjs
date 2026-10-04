import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  discoverGoRuntime,
  resolveProductRoot,
  ensureProductContract,
  preflightToolchain,
  buildGoProduct,
  deployGoCloudflare,
} from '../../src/go/index.js';
import { runGo } from '../../src/commands/go.js';

const SDK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');


function tempStateRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-go-test-state-'));
}

test('discoverGoRuntime finds agentsam-go-worker without inventing a sibling', () => {
  const discovery = discoverGoRuntime(SDK_ROOT);
  assert.equal(discovery.go.ok, true);
  assert.ok(discovery.runtime, 'expected Go runtime');
  assert.match(discovery.runtime.module, /agentsam-go-worker/);
  assert.equal(path.basename(discovery.runtime.productRoot), 'agentsam-go-worker');
  const productRoot = resolveProductRoot(discovery, 'agentsam-go-worker');
  const contract = ensureProductContract(productRoot);
  assert.equal(contract.product, 'agentsam-go-worker');
  assert.equal(contract.existing, true);
  assert.deepEqual(contract.created, []);
});

test('ensureProductContract refuses missing product roots instead of scaffolding siblings', () => {
  const missing = path.join(os.tmpdir(), `agentsam-go-missing-${Date.now()}`);
  assert.throws(() => ensureProductContract(missing), /product_root_missing/);
});

test('buildGoProduct emits build receipt after go test/vet/build', () => {
  const discovery = discoverGoRuntime(SDK_ROOT);
  const productRoot = resolveProductRoot(discovery);
  const stateRoot = tempStateRoot();
  const result = buildGoProduct({
    productRoot,
    runtimeRoot: discovery.runtime.runtimeRoot,
    repositoryRoot: discovery.repository_root,
    stateRoot,
  });
  assert.equal(result.receipt.schema, 'agentsam.go-build-receipt.v1');
  assert.equal(result.tests.ok, true);
  assert.equal(result.vet.ok, true);
  assert.ok(result.build.binary);
  assert.match(result.receipt.artifact.digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.receipt.tests.runtime_probe, true);
  assert.match(result.receipt.source.identity, /^git:[a-f0-9]{40}$/);
  assert.equal(result.probe.checks.source_identity, true);
  assert.equal(result.probe.checks.source_commit, true);
  assert.equal(result.probe.checks.error_envelope, true);
  assert.equal(result.probe.checks.clean_shutdown, true);
  assert.ok(fs.existsSync(result.receiptPath));
});

test('agentsam go build --json exposes only portable build paths', async () => {
  const stateRoot = tempStateRoot();
  const chunks = [];

  const result = await runGo(
    ['build', '--json'],
    {
      write: (value) => chunks.push(String(value)),
      stateRoot,
    },
  );

  assert.ok(path.isAbsolute(result.receiptPath), 'internal execution keeps absolute receipt path');
  assert.ok(path.isAbsolute(result.build.binary), 'internal execution keeps absolute binary path');

  const output = chunks.join('');
  const parsed = JSON.parse(output);

  assert.equal(path.isAbsolute(parsed.receiptPath), false);
  assert.equal(path.isAbsolute(parsed.build.binary), false);
  assert.equal(path.isAbsolute(parsed.receipt.runtime.module_root), false);
  assert.equal(Object.hasOwn(parsed.probe || {}, 'origin'), false);
  assert.equal(Object.hasOwn(parsed.receipt?.probe || {}, 'origin'), false);
  assert.equal(output.includes(SDK_ROOT), false);
});


test('Go preflight does not execute Docker when Docker is not required', () => {
  const discovery = discoverGoRuntime(SDK_ROOT);
  const productRoot = resolveProductRoot(discovery, 'agentsam-go-worker');
  const calls = [];

  const spawn = (command, args = []) => {
    calls.push({
      command: String(command),
      args: Array.isArray(args) ? args.map(String) : [],
    });

    if (String(command) === 'docker') {
      throw new Error('docker_must_not_execute_when_not_required');
    }

    return {
      status: 0,
      stdout: 'ok',
      stderr: '',
    };
  };

  const result = preflightToolchain({
    requireDocker: false,
    productRoot,
    spawn,
  });

  assert.equal(result.ok, true);

  assert.equal(
    calls.some((call) => call.command === 'docker'),
    false,
  );

  const dockerCheck = result.checks.find(
    (check) => check.id === 'docker',
  );

  assert.equal(dockerCheck?.ok, true);
  assert.equal(dockerCheck?.detail, 'skipped:not-required');
});


test('deployGoCloudflare skipDeploy never executes Docker or remote deployment', async () => {
  const discovery = discoverGoRuntime(SDK_ROOT);
  const productRoot = resolveProductRoot(discovery, 'agentsam-go-worker');
  const stateRoot = tempStateRoot();
  const calls = [];

  const spawn = (command, args = []) => {
    calls.push({
      command: String(command),
      args: Array.isArray(args) ? args.map(String) : [],
    });

    throw new Error(
      'spawn_must_not_execute_during_skip_deploy: '
      + String(command),
    );
  };

  const commit = '0'.repeat(40);

  const result = await deployGoCloudflare({
    productRoot,
    stateRoot,
    product: 'agentsam-go-worker',
    skipDeploy: true,
    officialRelease: false,
    source: {
      identity: `git:${commit}`,
      commit,
      package_name: '@inneranimalmedia/agentsam-go-worker',
      package_version: '0.1.0',
    },
    builtAt: new Date(0).toISOString(),
    artifactDigest: `sha256:${'0'.repeat(64)}`,
    containerDigest: null,
    spawn,
  });

  assert.equal(result.deployed, false);
  assert.equal(result.probes.skipped, true);
  assert.equal(result.registry.remote, false);
  assert.equal(
    result.registry.reason,
    'self_host_registry_isolated',
  );

  assert.equal(calls.length, 0);

  assert.ok(result.receiptPath);
  assert.ok(result.productPath);
  assert.ok(fs.existsSync(result.receiptPath));
  assert.ok(fs.existsSync(result.productPath));
});


test('agentsam go --cloudflare agentsam-go-worker --skip-deploy is idempotent', async () => {
  const stateRoot = tempStateRoot();
  const chunks = [];
  const write = (v) => chunks.push(String(v));
  const first = await runGo(
    ['--cloudflare', 'agentsam-go-worker', '--skip-deploy', '--json'],
    { write, stateRoot },
  );
  assert.equal(first.ok, true);
  assert.equal(first.product, 'agentsam-go-worker');
  assert.equal(first.scaffold_changes_required, false);
  assert.equal(first.mode, 'self_host');
  assert.equal(first.deploy.registry.reason, 'self_host_registry_isolated');

  const chunks2 = [];
  const second = await runGo(
    ['--cloudflare', 'agentsam-go-worker', '--skip-deploy', '--json'],
    {
      write: (v) => chunks2.push(String(v)),
      stateRoot,
    },
  );
  assert.equal(second.ok, true);
  assert.equal(second.existing_product, true);
  assert.equal(second.scaffold_changes_required, false);
  assert.ok(second.deploy.receiptPath);
  assert.ok(fs.existsSync(second.deploy.productPath));
});

test('agentsam go status --json reports discovery', async () => {
  const stateRoot = tempStateRoot();
  const chunks = [];
  const result = await runGo(
    ['status', '--json'],
    {
      write: (v) => chunks.push(String(v)),
      stateRoot,
    },
  );
  assert.equal(result.ok, true);
  assert.ok(result.discovery.go.ok);
  const parsed = JSON.parse(chunks.join(''));
  assert.equal(parsed.product, 'agentsam-go-worker');
});
