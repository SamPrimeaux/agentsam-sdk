import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  deployGoCloudflare,
  extractWorkersDevUrl,
  probeGoDeployment,
  readLatestWranglerDeployment,
  resolveWranglerIdentity,
  resolveConfiguredDeploymentUrl,
} from '../../src/go/cloudflare.js';
import { buildProductRow } from '../../src/go/receipts.js';

const SDK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PRODUCT_ROOT = path.join(SDK_ROOT, 'apps/agentsam-go-worker');
const EXPECTED_HASH = '2e60bba13dc2bc37d75dd2ce5deb25466f19cb2994e20889388948879875eae9';


test('configured custom domain is canonical Go deployment URL', () => {
  assert.equal(
    resolveConfiguredDeploymentUrl(PRODUCT_ROOT),
    'https://runtime.inneranimalmedia.com',
  );
});

test('extractWorkersDevUrl parses wrangler output', () => {
  const url = extractWorkersDevUrl('Published agentsam-go-worker\n  https://agentsam-go-worker.example.workers.dev\n');
  assert.equal(url, 'https://agentsam-go-worker.example.workers.dev');
});

test('probeGoDeployment requires edge, source identity, capabilities, deterministic functions and ErrorEnvelope', async () => {
  const responses = new Map([
    ['/', { status: 200, body: { ok: true, edge: 'worker', runtime: 'go/native-container', source: 'git:abc123' } }],
    ['/edge/health', { status: 200, body: { ok: true, edge: 'worker', runtime: 'go/native-container', source: 'git:abc123' } }],
    ['/health', {
      status: 200,
      body: {
        ok: true,
        service: 'agentsam-go-worker',
        runtime: 'go',
        target: 'cloudflare',
        build: { source: 'git:abc123', commit: 'abc123' },
      },
    }],
    ['/v1/runtime', {
      status: 200,
      body: { schema: 'agentsam.go-runtime.v1', os: 'linux', capabilities: ['hash', 'inspect', 'runtime', 'capabilities'] },
    }],
    ['/v1/capabilities', {
      status: 200,
      body: { schema: 'agentsam.go-capabilities.v1', capabilities: ['hash', 'inspect', 'runtime', 'capabilities'] },
    }],
    ['/v1/hash', { status: 200, body: { hash: EXPECTED_HASH, algorithm: 'sha256' } }],
    ['/v1/inspect', { status: 200, body: { findings: [{ kind: 'hardcoded_color', value: '#2563eb' }] } }],
  ]);
  let inspectCalls = 0;
  const fetchImpl = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/v1/inspect') {
      inspectCalls += 1;
      if (inspectCalls === 2) {
        return {
          status: 400,
          async json() {
            return {
              ok: false,
              schema_version: 1,
              code: 'INVALID_ARGUMENT',
              reason: 'input_invalid',
            };
          },
        };
      }
    }
    const row = responses.get(pathname);
    assert.ok(row, 'unexpected probe path: ' + pathname);
    return {
      status: row.status,
      async json() { return row.body; },
    };
  };

  const result = await probeGoDeployment('https://example.workers.dev', {
    fetchImpl,
    expectedSource: 'git:abc123',
    expectedSourceCommit: 'abc123',
    expectedTarget: 'cloudflare',
  });
  assert.equal(result.ok, true);
  assert.equal(result.checks.edge_root, true);
  assert.equal(result.checks.edge_health, true);
  assert.equal(result.checks.source_identity, true);
  assert.equal(result.checks.source_commit, true);
  assert.equal(result.checks.capabilities, true);
  assert.equal(result.results.deterministic_hash.ok, true);
  assert.equal(result.results.deterministic_inspect.ok, true);
  assert.equal(result.results.malformed_rejected.ok, true);
});

test('readLatestWranglerDeployment normalizes authoritative deployment/version identity', () => {
  const spawn = () => ({
    status: 0,
    stdout: JSON.stringify([
      {
        id: 'dep_old',
        created_on: '2026-09-24T00:00:00Z',
        versions: [{ version_id: 'ver_old', percentage: 100 }],
      },
      {
        id: 'dep_new',
        created_on: '2026-09-25T00:00:00Z',
        versions: [{ version_id: 'ver_new', percentage: 100 }],
      },
    ]),
    stderr: '',
  });
  const result = readLatestWranglerDeployment(PRODUCT_ROOT, 'agentsam-go-worker', { spawn });
  assert.equal(result.ok, true);
  assert.equal(result.deployment_id, 'dep_new');
  assert.equal(result.version_id, 'ver_new');
});

test('resolveWranglerIdentity fails closed when authentication is unavailable', () => {
  const spawn = () => ({ status: 1, stdout: '', stderr: 'not logged in' });
  const result = resolveWranglerIdentity(PRODUCT_ROOT, { spawn });
  assert.equal(result.ok, false);
  assert.equal(result.authenticated, false);
  assert.equal(result.error, 'cloudflare_not_authenticated');
});

test('resolveWranglerIdentity requires an explicit account when multiple are available', () => {
  const spawn = () => ({
    status: 0,
    stdout: JSON.stringify({
      loggedIn: true,
      authType: 'OAuth Token',
      accounts: [
        { id: 'acc_a', name: 'Account A', type: 'standard' },
        { id: 'acc_b', name: 'Account B', type: 'standard' },
      ],
    }),
    stderr: '',
  });
  const ambiguous = resolveWranglerIdentity(PRODUCT_ROOT, { spawn });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.error, 'cloudflare_account_ambiguous');

  const selected = resolveWranglerIdentity(PRODUCT_ROOT, {
    spawn,
    requestedAccountId: 'acc_b',
  });
  assert.equal(selected.ok, true);
  assert.equal(selected.account.id, 'acc_b');
});

test('Cloudflare self-host dry run binds the resolved account and never mutates IAM D1', async () => {
  const calls = [];
  const cloudflareIdentity = {
    ok: true,
    authenticated: true,
    auth_type: 'OAuth Token',
    account: { id: 'acc_user', name: 'User Cloudflare', type: 'standard' },
    accounts: [{ id: 'acc_user', name: 'User Cloudflare', type: 'standard' }],
  };
  const spawn = (command, args = [], options = {}) => {
    calls.push({ command, args, env: options.env || {} });
    if (command === 'docker' && args[0] === 'info') {
      return { status: 0, stdout: 'ok', stderr: '' };
    }
    if (args.includes('deploy') && args.includes('--dry-run')) {
      assert.equal(options.env.CLOUDFLARE_ACCOUNT_ID, 'acc_user');
      assert.ok(args.includes('AGENTSAM_BUILD_SOURCE:npm:@inneranimalmedia/agentsam-go-worker@0.1.0'));
      return { status: 0, stdout: 'Total Upload: 1 KiB', stderr: '' };
    }
    throw new Error('unexpected spawn: ' + [command, ...args].join(' '));
  };

  const result = await deployGoCloudflare({
    productRoot: PRODUCT_ROOT,
    product: 'agentsam-go-worker',
    dryRun: true,
    accountId: 'acc_user',
    cloudflareIdentity,
    source: {
      identity: 'npm:@inneranimalmedia/agentsam-go-worker@0.1.0',
      commit: null,
      package_name: '@inneranimalmedia/agentsam-go-worker',
      package_version: '0.1.0',
    },
    builtAt: '2026-09-25T00:00:00.000Z',
    spawn,
  });

  assert.equal(result.deployed, false);
  assert.equal(result.dryRunValidated, true);
  assert.equal(result.receipt.dry_run, true);
  assert.equal(result.receipt.skipped_deploy, false);
  assert.equal(result.receipt.registry_mode, 'self_host_local');
  assert.equal(result.receipt.cloudflare.account_id, 'acc_user');
  assert.equal(result.registry.remote, false);
  assert.equal(result.registry.reason, 'self_host_registry_isolated');
  assert.ok(calls.some((call) => call.args.includes('deploy') && call.args.includes('--dry-run')));
});


test('buildProductRow stays on agentsam_products projection with deployment identity', () => {
  const row = buildProductRow({
    product: 'agentsam-go-worker',
    repositoryId: 'github:samprimeaux/agentsam-sdk',
    commit: 'abc',
    url: 'https://x.workers.dev',
    health: 'healthy',
    workerDeploymentId: 'dep_1',
    workerVersionId: 'ver_1',
    artifactDigest: 'sha256:binary',
    containerDigest: 'sha256:image',
  });
  assert.equal(row.slug, 'agentsam-go-worker');
  assert.equal(row.kind, 'service');
  assert.equal(row.status, 'deployed');
  assert.equal(row.canonical_path, 'apps/agentsam-go-worker');
  assert.equal(row.package_name, '@inneranimalmedia/agentsam-go-worker');
  assert.equal(row.metadata.runtime, 'go');
  assert.equal(row.metadata.deployment.worker_deployment_id, 'dep_1');
  assert.equal(row.metadata.deployment.worker_version_id, 'ver_1');
});

test('source identity produces a source-keyed Container instance', async () => {
  const { runtimeInstanceKey } = await import('../../apps/agentsam-go-worker/worker/src/identity.js');
  const first = runtimeInstanceKey('git:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  const second = runtimeInstanceKey('git:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  assert.equal(first, 'runtime:git:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(second, 'runtime:git:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  assert.notEqual(first, second);
  assert.equal(runtimeInstanceKey('npm:@inneranimalmedia/agentsam-go-worker@0.1.0'), 'runtime:npm:@inneranimalmedia/agentsam-go-worker@0.1.0');
});
