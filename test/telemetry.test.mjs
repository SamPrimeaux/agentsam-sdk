import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentEvent, createUsageSnapshot } from '../src/telemetry/index.js';

test('AgentEvent is compact serializable provider-neutral telemetry', () => {
  const event = createAgentEvent('context.compaction.completed', { before: 181_000, after: 72_000 }, {
    runId: 'run_test', sequence: 4, timestamp: '2026-09-12T00:00:00.000Z',
  });
  assert.equal(event.type, 'context.compaction.completed');
  assert.equal(event.run_id, 'run_test');
  assert.doesNotThrow(() => JSON.stringify(event));
});

test('current active context and cumulative run usage are different metrics', () => {
  const usage = createUsageSnapshot({
    current_context: { input_tokens: 48_000, window_tokens: 1_050_000 },
    cumulative: { input_tokens: 310_000, output_tokens: 22_000, cached_input_tokens: 120_000, cache_write_tokens: 12_000, reasoning_tokens: 8_000 },
    estimate_kind: 'provider',
  });
  assert.equal(usage.current_context.input_tokens, 48_000);
  assert.equal(usage.cumulative.input_tokens, 310_000);
  assert.equal(usage.provider_authoritative, true);
});

import {
  createRunReceipt,
  createUsageReceipt,
  createApprovalReceipt,
  createTerminalJobReceipt,
} from '../src/telemetry/index.js';

test('runtime receipts are account-owned and emit no tenant/workspace/user ownership aliases', () => {
  const run = createRunReceipt({
    id: 'arun_1', account_id: 'au_1', mode: 'agent', status: 'running',
    source_client: 'cli', surface: 'cli', reasoning_effort: 'high', requested_service_tier: 'fast',
  });
  assert.equal(run.account_id, 'au_1');
  assert.equal(run.source_client, 'cli');
  assert.equal(run.requested_service_tier, 'fast');
  assert.equal('user_id' in run, false);
  assert.equal('tenant_id' in run, false);
  assert.equal('workspace_id' in run, false);
});

test('usage receipt models exactly one provider call and keeps cache/reasoning economics', () => {
  const usage = createUsageReceipt({
    id: 'ue_1', account_id: 'au_1', agent_run_id: 'arun_1', provider: 'openai', model_key: 'gpt-6-astra',
    model_call_index: 2, provider_request_id: 'resp_1', input_tokens: 1000, cached_input_tokens: 600,
    cache_write_tokens: 20, output_tokens: 100, reasoning_tokens: 40, cost_usd: 0.12, cost_basis: 'provider',
  });
  assert.equal(usage.total_tokens, 1100);
  assert.equal(usage.cached_input_tokens, 600);
  assert.equal(usage.reasoning_tokens, 40);
  assert.equal(usage.model_call_index, 2);
});

test('approval and terminal receipts preserve lineage without turning D1 into transcript storage', () => {
  const approval = createApprovalReceipt({
    id: 'appr_1', account_id: 'au_1', agent_run_id: 'arun_1', tool_call_id: 'call_1', terminal_job_id: 'tjob_1',
    action_summary: 'Deploy worker', sanitizedInput: { worker: 'api' }, risk_level: 'high',
  });
  assert.equal(approval.terminal_job_id, 'tjob_1');
  assert.match(approval.sanitized_input_json, /worker/);

  const job = createTerminalJobReceipt({
    id: 'tjob_1', account_id: 'au_1', instance_id: 'tinst_1', connection_id: 'conn_1',
    execos_run_id: 'xrun_1', status: 'running', idempotency_key: 'idem_1', max_attempts: 1,
  });
  assert.equal(job.execos_run_id, 'xrun_1');
  assert.equal(job.max_attempts, 1);
  assert.equal('stdout' in job, false);
  assert.equal('stderr' in job, false);
  assert.equal('command' in job, false);
});

test('runtime receipts refuse model-invented account identity', () => {
  assert.throws(() => createRunReceipt({ id: 'arun_1' }), /account_id is required/);
  assert.throws(() => createUsageReceipt({ id: 'ue_1', provider: 'openai', model_key: 'gpt-6-astra' }), /account_id is required/);
});
