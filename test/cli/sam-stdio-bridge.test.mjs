import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createSamOS } from '../../src/sam/os.js';
import { stdioMode } from '../../src/sam/bridge/policy.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const bridge = path.join(root, 'src/sam/bridge/stdio.mjs');

function request(payload, cwd = root) {
  const result = spawnSync(process.execPath, [bridge], {
    cwd, input: JSON.stringify(payload), encoding: 'utf8',
    timeout: 20_000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.ok(result.stdout.trim(), result.stderr);
  return JSON.parse(result.stdout);
}

test('stdio discovery comes from operation-owned interop grants, not an ID allowlist', () => {
  const expected = createSamOS().list().filter(op => stdioMode(op)).map(op => op.id);
  const response = request({ method: 'discover', query: { limit: 200 } });
  assert.equal(response.ok, true);
  assert.deepEqual(response.result.operations.map(op => op.id), expected);
  assert.ok(expected.length > 3);
  assert.ok(expected.includes('arch.capabilities.status'));
  assert.ok(expected.includes('robotics.motion.validate'));
  assert.ok(expected.includes('repository.inspect'));
  assert.ok(!expected.includes('terminal.exec'));
  assert.ok(!expected.includes('cad.blender.inspect'));
  assert.ok(!expected.includes('codebaseindex.ingest'));
  assert.ok(!expected.includes('planning.astar')); // accepts JS callbacks, not JSON
});

test('new portable operations can opt in without changing the bridge', () => {
  const op = {
    id: 'sample.portable', handler: () => ({}), status: 'stable', risk: 'read_only',
    execution: {
      lanes: ['local'], model: 'never', network: 'none',
      sideEffects: 'none', provider_spend: 'never',
    },
    interop: { stdio: 'pure' },
  };
  assert.equal(stdioMode(op), 'pure');
  assert.equal(stdioMode({ ...op, interop: undefined }), null);
  assert.equal(stdioMode({ ...op, risk: 'write' }), null);
  assert.equal(stdioMode({ ...op, execution: { ...op.execution, sideEffects: 'local_write' } }), null);
  assert.equal(stdioMode({ ...op, execution: { ...op.execution, network: 'optional' } }), null);
  assert.equal(stdioMode({ ...op, authority: [{ type: 'account' }] }), null);
  assert.equal(stdioMode({ ...op, auth: { account: true } }), null);
});

test('stdio invokes newly exposed native JS computations and preserves result contract', () => {
  const result = request({ method: 'invoke', id: 'arch.capabilities.status', input: {} });
  assert.equal(result.ok, true);
  assert.equal(result.result.ok, true);
  assert.equal(result.result.operation, 'arch.capabilities.status');
  assert.equal(result.result.schema, 'agentsam.result.v1');
  assert.equal(result.result.receipt.status, 'completed');

  const artifact = request({
    method: 'invoke', id: 'artifact.render', input: { title: 'Portable report', summary: 'Generated locally' },
  });
  assert.equal(artifact.ok, true);
  assert.equal(artifact.result.ok, true);
  assert.match(artifact.result.data.files['report.md'], /Portable report/);
});

test('stdio refuses unbound privileged/host capabilities and traversal', () => {
  for (const id of ['terminal.exec', 'codebaseindex.ingest', 'cad.blender.inspect',
                     'cms.page.publish', 'sam.superbash', 'planning.astar']) {
    const denial = request({ method: 'invoke', id, input: {} });
    assert.equal(denial.ok, false, id);
    assert.equal(denial.error.code, 'sam_bridge_operation_not_allowed', id);
    const status = request({ method: 'status', id });
    assert.equal(status.result.ready, false, id);
  }
  const escape = request({ method: 'invoke', id: 'repository.inspect', input: { root: '/tmp' } });
  assert.equal(escape.ok, false);
  assert.equal(escape.error.code, 'sam_bridge_path_outside_workspace');
});

test('decision bridge accepts deterministic evaluation but not custom/semantic evaluators', () => {
  const result = request({
    method: 'invoke', id: 'decision.evaluate',
    input: {
      state: { facts: { 'choose.intent': 'inspect' } },
      questions: [{ id: 'intent', type: 'choose', options: ['inspect', 'publish'],
                    evaluator_hint: 'deterministic' }],
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.result.ok, true);
  assert.equal(result.result.data.answers.intent.value, 'inspect');
  const rejected = request({
    method: 'invoke', id: 'decision.evaluate',
    input: { questions: [{ id: 'q', type: 'check', evaluator_hint: 'semantic' }] },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'sam_bridge_decision_semantic_not_allowed');
  const injected = request({
    method: 'decide', input: { evaluators: ['remote-provider'] },
  });
  assert.equal(injected.ok, false);
  assert.equal(injected.error.code, 'sam_bridge_decision_evaluator_not_allowed');
});
