import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildWranglerInvocation, listWranglerNativeCommands, runWranglerNative, summarizeCloudflareCpuProfile, summarizeCloudflareCpuProfileFile } from '../src/cloudflare/index.js';
import { createCapabilityAdapter } from '../src/agent/capability-adapter.js';

function tempRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-cf-')); }

test('Cloudflare native command catalog exposes bounded read operations and never an auth-token secret read', () => {
  const ids = listWranglerNativeCommands().map((row) => row.id);
  assert.deepEqual(ids, ['whoami', 'deployments.list', 'versions.list', 'versions.view', 'types.check', 'queues.list', 'tunnel.list', 'tunnel.info']);
  assert.ok(!ids.some((id) => id.includes('token') || id.includes('secret') || id === 'deploy'));
});

test('Wrangler version view requires an exact version and keeps secret values unavailable', () => {
  const root = tempRoot();
  const plan = buildWranglerInvocation('versions.view', { cwd: root, name: 'demo', version_id: 'ver_123' });
  assert.deepEqual(plan.args, ['versions', 'view', 'ver_123', '--json', '--name', 'demo']);
  assert.throws(() => buildWranglerInvocation('versions.view', { cwd: root, name: 'demo' }), /version_id_required/);
});

test('Wrangler native invocation is argv-based and cwd/config scoped', () => {
  const root = tempRoot();
  fs.writeFileSync(path.join(root, 'wrangler.jsonc'), '{}');
  const plan = buildWranglerInvocation('deployments.list', { cwd: root, name: 'demo' });
  assert.equal(plan.cwd, root);
  assert.deepEqual(plan.args.slice(0, 4), ['deployments', 'list', '--json', '--name']);
  assert.equal(plan.args[4], 'demo');
  assert.ok(plan.args.includes('--config'));
  assert.throws(() => buildWranglerInvocation('whoami', { cwd: root, config: '../outside.toml' }), /outside_cwd/);
});

test('Wrangler native result preserves JSON and real exit code on failure', async () => {
  const root = tempRoot();
  const success = await runWranglerNative('whoami', { cwd: root }, { run: async () => ({ code: 0, stdout: JSON.stringify({ email: 'dev@example.com' }), stderr: '' }) });
  assert.equal(success.data.email, 'dev@example.com');
  await assert.rejects(
    runWranglerNative('versions.list', { cwd: root }, { run: async () => ({ code: 7, stdout: '', stderr: 'upstream failed' }) }),
    (error) => error.diagnostic?.exit_code === 7 && error.diagnostic?.code === 'wrangler_exit_nonzero',
  );
  await assert.rejects(
    runWranglerNative('deployments.list', { cwd: root }, { run: async () => ({ code: 1, stdout: '', stderr: 'Authentication error [code: 10000]\nRequest ID: req_cf_1\nCF-Ray: ray-123' }) }),
    (error) => error.diagnostic?.code === '10000' && error.diagnostic?.request_id === 'req_cf_1' && error.diagnostic?.ray_id === 'ray-123',
  );
});

test('CPU profile summary ranks self-time hotspots and explicitly rejects production timer inference', () => {
  const profile = {
    nodes: [
      { id: 1, callFrame: { functionName: 'fetch', url: 'worker.js', lineNumber: 0, columnNumber: 0 } },
      { id: 2, callFrame: { functionName: 'heavyLoop', url: 'worker.js', lineNumber: 10, columnNumber: 2 } },
      { id: 3, callFrame: { functionName: '(garbage collector)', url: '', lineNumber: -1, columnNumber: -1 } },
    ],
    samples: [1, 2, 2, 3],
    timeDeltas: [100, 1200, 800, 400],
  };
  const summary = summarizeCloudflareCpuProfile(profile);
  assert.equal(summary.top_frames[0].function, 'heavyLoop');
  assert.equal(summary.top_frames[0].self_us, 2000);
  assert.equal(summary.garbage_collection_ms, 0.4);
  assert.match(summary.timer_semantics, /do not advance during CPU-only execution/);
});

test('CPU profile file cannot escape runtime cwd', () => {
  const root = tempRoot();
  fs.writeFileSync(path.join(root, 'profile.cpuprofile'), JSON.stringify({ nodes: [], samples: [], timeDeltas: [] }));
  assert.equal(summarizeCloudflareCpuProfileFile({ cwd: root, file: 'profile.cpuprofile' }).file, 'profile.cpuprofile');
  assert.throws(() => summarizeCloudflareCpuProfileFile({ cwd: root, file: '../profile.cpuprofile' }), /outside_cwd/);
});

test('explicitly executable experimental Cloudflare capabilities enter cards-first discovery without exposing unavailable commands', () => {
  const adapter = createCapabilityAdapter();
  const rows = adapter.toolDescriptors();
  const ids = rows.map((row) => row.name);
  assert.ok(ids.includes('cloudflare.wrangler.native'));
  assert.ok(ids.includes('cloudflare.cpu.profile'));
  assert.ok(!ids.includes('cloudflare.cpu.audit'));
  assert.ok(!ids.includes('blender.build'));
  assert.equal(rows.find((row) => row.name === 'cloudflare.wrangler.native').risk, 'read');
});
