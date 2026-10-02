import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ERROR_REASON_POLICY,
  FAILURE_CLASS,
  canonicalizeErrorReason,
  createErrorEnvelope,
  normalizeError,
  planRecovery,
} from '../src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'protocol/errors/error-catalog.json'), 'utf8'));

test('v2 keeps broad codes stable while preserving adapter-specific timeout reasons', () => {
  assert.equal(catalog.codes.length, 17);
  assert.equal(catalog.schema_version, 2);
  const cases = [
    ['http', 'AGENTSAM_HOOK_TIMEOUT', 'hook_http_timeout'],
    ['mcp', 'hook_mcp_timeout:server', 'hook_mcp_timeout'],
    ['lsp', 'hook_lsp_timeout:rust', 'hook_lsp_timeout'],
    ['command', 'hook_command_timeout:node', 'hook_command_timeout'],
  ];
  for (const [adapter, native, reason] of cases) {
    const error = normalizeError(Object.assign(new Error(native), { code: native.split(':')[0] }), {
      adapter,
      feature: `hooks.${adapter}`,
      failure_behavior: 'fail_closed',
      side_effect_state: 'not_started',
    });
    assert.equal(error.code, 'DEADLINE_EXCEEDED');
    assert.equal(error.reason, reason);
    assert.equal(error.adapter, adapter);
    assert.equal(error.feature, `hooks.${adapter}`);
  }
});

test('v2 dimensions use generic stages and retain subsystem-native stages separately', () => {
  const error = createErrorEnvelope({
    reason: 'schema_contract_mismatch',
    stage: 'constraint_solve',
    feature: 'database.migrate',
    failure_behavior: 'abort',
    side_effect_state: 'confirmed_not_applied',
    message: 'portable schema ownership differs',
  });
  assert.equal(error.domain, 'schema');
  assert.equal(error.failure_class, 'schema');
  assert.equal(error.stage, 'validate');
  assert.equal(error.native_stage, 'constraint_solve');
  assert.equal(error.feature, 'database.migrate');
  assert.equal(error.side_effect_state, 'confirmed_not_applied');
  assert.throws(() => createErrorEnvelope({ reason: 'input_invalid', feature: 'Not a dotted ID' }), /Invalid AgentSam error feature/);
});

test('recovery consumes the generated failure and side-effect vocabularies', () => {
  assert.equal(FAILURE_CLASS.VALIDATION, 'validation');
  const error = createErrorEnvelope({
    reason: 'input_invalid', message: 'bad input', side_effect_state: 'confirmed_not_applied',
  });
  const recovery = planRecovery(error);
  assert.equal(recovery.disposition, 'await_user');
  assert.equal(recovery.reason, 'invalid_input');
});

test('every harvested legacy hook alias resolves to its catalog reason', () => {
  for (const row of catalog.reasons.filter((reason) => reason.domain === 'hook' || reason.aliases?.some((alias) => /hook|mcp|lsp|capability|agent/i.test(alias)))) {
    for (const alias of row.aliases || []) {
      assert.equal(canonicalizeErrorReason(`${alias}:native detail`), row.name, alias);
    }
  }
});

test('generated JS, Go, Rust, Python, and packed catalog policies retain parity', () => {
  const packedCatalog = JSON.parse(fs.readFileSync(path.join(root, 'packages/agentsam-errors/protocol/error-catalog.json'), 'utf8'));
  assert.deepEqual(packedCatalog, catalog);
  const expected = Object.fromEntries(catalog.reasons.map((row) => [row.name, {
    code: row.code,
    domain: row.domain,
    failure_class: row.failure_class,
    severity: row.severity,
    retryable: row.retryable,
    resolution_owner: row.resolution_owner,
    remediation_action: row.remediation_action,
    default_stage: row.default_stage,
  }]));
  assert.deepEqual(ERROR_REASON_POLICY, expected);

  const python = JSON.parse(execFileSync('python3', ['-c', [
    'import json',
    'from agentsam_sdk.errors import ERROR_REASON_POLICY',
    'print(json.dumps(ERROR_REASON_POLICY, sort_keys=True))',
  ].join(';')], { cwd: root, env: { ...process.env, PYTHONPATH: path.join(root, 'python') }, encoding: 'utf8' }));
  assert.deepEqual(python, expected);

  const go = fs.readFileSync(path.join(root, 'packages/agentsam-hooks/bindings/go/errors_generated.go'), 'utf8');
  const rust = fs.readFileSync(path.join(root, 'packages/agentsam-hooks/bindings/rust/src/errors_generated.rs'), 'utf8');
  for (const row of catalog.reasons) {
    assert.ok(go.includes(`${JSON.stringify(row.name)}: {Code: ${JSON.stringify(row.code)}`), `Go policy missing ${row.name}`);
    assert.ok(rust.includes(`reason: ${JSON.stringify(row.name)}, code: ${JSON.stringify(row.code)}`), `Rust policy missing ${row.name}`);
  }
});
