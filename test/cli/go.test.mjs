import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { discoverGoRuntime, resolveProductRoot, ensureProductContract, buildGoProduct } from '../../src/go/index.js';
import { runGo } from '../../src/commands/go.js';

const SDK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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
  const result = buildGoProduct({
    productRoot,
    runtimeRoot: discovery.runtime.runtimeRoot,
    repositoryRoot: discovery.repository_root,
  });
  assert.equal(result.receipt.schema, 'agentsam.go-build-receipt.v1');
  assert.equal(result.tests.ok, true);
  assert.equal(result.vet.ok, true);
  assert.ok(result.build.binary);
  assert.ok(fs.existsSync(result.receiptPath));
});

test('agentsam go --cloudflare agentsam-go-worker --skip-deploy is idempotent', async () => {
  const chunks = [];
  const write = (v) => chunks.push(String(v));
  const first = await runGo(['--cloudflare', 'agentsam-go-worker', '--skip-deploy', '--json'], { write });
  assert.equal(first.ok, true);
  assert.equal(first.product, 'agentsam-go-worker');
  assert.equal(first.scaffold_changes_required, false);

  const chunks2 = [];
  const second = await runGo(['--cloudflare', 'agentsam-go-worker', '--skip-deploy', '--json'], {
    write: (v) => chunks2.push(String(v)),
  });
  assert.equal(second.ok, true);
  assert.equal(second.existing_product, true);
  assert.equal(second.scaffold_changes_required, false);
  assert.ok(second.deploy.receiptPath);
  assert.ok(fs.existsSync(second.deploy.productPath));
});

test('agentsam go status --json reports discovery', async () => {
  const chunks = [];
  const result = await runGo(['status', '--json'], { write: (v) => chunks.push(String(v)) });
  assert.equal(result.ok, true);
  assert.ok(result.discovery.go.ok);
  const parsed = JSON.parse(chunks.join(''));
  assert.equal(parsed.product, 'agentsam-go-worker');
});
