import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyAgentRunRetry,
  evaluateAgentRunWake,
  isAgentRunModelActiveStatus,
  isAgentRunTerminalStatus,
  isAgentRunWaitingStatus,
  projectRunEventToActivity,
  transitionAgentRunStatus,
} from '../dist/index.js';

test('run lifecycle distinguishes model-active, waiting, and terminal states', () => {
  assert.equal(isAgentRunModelActiveStatus('running'), true);
  assert.equal(isAgentRunModelActiveStatus('waiting_external'), false);
  assert.equal(isAgentRunWaitingStatus('waiting_child'), true);
  assert.equal(isAgentRunTerminalStatus('timed_out'), true);
  assert.equal(isAgentRunTerminalStatus('partial'), false);

  assert.equal(transitionAgentRunStatus('queued', { type: 'start' }), 'running');
  assert.equal(transitionAgentRunStatus('running', { type: 'suspend', status: 'waiting_external' }), 'waiting_external');
  assert.equal(transitionAgentRunStatus('waiting_external', { type: 'wake' }), 'queued');
  assert.equal(transitionAgentRunStatus('running', { type: 'cancel' }), 'cancelled');
  assert.equal(transitionAgentRunStatus('running', { type: 'timeout' }), 'timed_out');
  assert.equal(transitionAgentRunStatus('completed', { type: 'wake' }), 'completed');
});

test('wake evaluation is deterministic and rejects duplicate wake signals', () => {
  const suspension = {
    runId: 'run_parent',
    state: 'waiting_child',
    reason: 'child_run',
    dependencyRunIds: ['run_child'],
    expiresAt: 2_000,
  };
  const wake = {
    id: 'wake_1',
    runId: 'run_parent',
    kind: 'dependency',
    dependencyRunId: 'run_child',
    occurredAt: 1_000,
    dedupeKey: 'child:run_child:complete',
  };

  assert.deepEqual(evaluateAgentRunWake(suspension, wake), {
    accepted: true,
    reason: 'accepted',
    nextStatus: 'queued',
  });
  assert.deepEqual(evaluateAgentRunWake(suspension, wake, {
    consumedDedupeKeys: [wake.dedupeKey],
  }), {
    accepted: false,
    reason: 'duplicate',
  });
  assert.equal(evaluateAgentRunWake(suspension, { ...wake, dependencyRunId: 'other' }).accepted, false);
  assert.equal(evaluateAgentRunWake(suspension, { ...wake, occurredAt: 2_001 }, { now: 2_001 }).reason, 'expired');
});

test('retry classification only auto-retries transient failures', () => {
  assert.deepEqual(classifyAgentRunRetry({ statusCode: 429 }), {
    class: 'transient',
    automaticRetry: true,
    reason: 'http_429',
  });
  assert.equal(classifyAgentRunRetry({ code: 'approval_required' }).class, 'wait');
  assert.equal(classifyAgentRunRetry({ code: 'repository_changed' }).class, 'replan');
  assert.equal(classifyAgentRunRetry({ code: 'permission_denied' }).automaticRetry, false);
});

test('append-only run events project to agentsam.activity.v1 without losing provenance', () => {
  const projected = projectRunEventToActivity({
    id: 'evt_42',
    runId: 'run_parent',
    parentRunId: 'run_root',
    seq: 42,
    eventType: 'run.suspended',
    status: 'waiting_external',
    label: 'Waiting for deployment',
    detail: 'Provider job is still pending',
    createdAt: Date.parse('2026-10-03T07:00:00.000Z'),
    source: { kind: 'queue', name: 'deployments' },
    evidence: { provider_job_id: 'dep_123' },
  });

  assert.equal(projected.schema, 'agentsam.activity.v1');
  assert.equal(projected.phase, 'waiting');
  assert.equal(projected.event, 'phase.changed');
  assert.equal(projected.parent_id, 'run_root');
  assert.equal(projected.evidence.run_event_id, 'evt_42');
  assert.equal(projected.evidence.run_event_type, 'run.suspended');
  assert.equal(projected.evidence.run_status, 'waiting_external');
});
