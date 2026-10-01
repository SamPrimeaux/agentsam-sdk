import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AgentSamError,
  ERROR_CODE,
  ERROR_REASON,
  createToolError,
  createToolErrorEnvelope,
  planRecovery,
} from '../src/index.js';

test('tool errors reuse the canonical AgentSam vocabulary', () => {
  const error = createToolError({
    reason: ERROR_REASON.STALE_VERSION,
    message: 'The resource changed before this mutation could commit.',
    tool: 'goap',
    stage: 'activate_goal',
    failure_class: 'conflict',
    resource: { type: 'blackboard', id: 'bb_1' },
    details: { expected_revision: 4, actual_revision: 5 },
    operation: {
      kind: 'mutation',
      action: 'activate_goal',
      resource_type: 'blackboard',
      resource_id: 'bb_1',
      read_only: false,
      idempotent: true,
      side_effect_state: 'confirmed_not_applied',
    },
  });

  assert.equal(error instanceof AgentSamError, true);
  assert.equal(error.code, ERROR_CODE.ABORTED);
  assert.equal(error.reason, ERROR_REASON.STALE_VERSION);
  assert.equal(error.envelope.domain, 'tool');
  assert.equal(error.envelope.tool, 'goap');
  assert.equal(error.envelope.retryable, true);
  assert.equal(error.envelope.details.expected_revision, 4);

  const recovery = planRecovery(error.envelope);
  assert.equal(recovery.disposition, 'retry');
  assert.equal(recovery.reason, 'optimistic_concurrency');
});

test('tool envelope preserves generic internal adapter classification', () => {
  const envelope = createToolErrorEnvelope({
    reason: ERROR_REASON.INTERNAL_ADAPTER_FAILED,
    message: 'The storage adapter cannot provide the required atomic primitive.',
    tool: 'queue-control',
    stage: 'dispatch',
    resource: { type: 'adapter', id: 'sqlite' },
  });

  assert.equal(envelope.code, ERROR_CODE.INTERNAL);
  assert.equal(envelope.domain, 'tool');
  assert.equal(envelope.tool, 'queue-control');
  assert.equal(envelope.resolution_owner, 'agentsam');
});
