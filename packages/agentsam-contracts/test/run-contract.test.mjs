import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  classifyAgentRunRetry,
  evaluateAgentRunWake,
  isAgentRunModelActiveStatus,
  isAgentRunTerminalStatus,
  isAgentRunWaitingStatus,
  projectRunEventToActivity,
  transitionAgentRunStatus,
  AGENT_RUN_STATUSES,
  AGENT_RUN_STORAGE_STATUSES,
  AGENT_RUN_SUSPENSION_STATES,
  AGENT_RUN_SUSPENSION_REASONS,
  AGENT_RUN_MODES,
  AGENT_RUN_SELECTED_BY,
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


test('run and activity wire schemas validate actual projections and storage vocabularies', () => {
  const readSchema = name => JSON.parse(fs.readFileSync(new URL('../schemas/' + name, import.meta.url), 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const run = readSchema('run.v1.schema.json');
  const activity = readSchema('activity.v1.schema.json');
  const start = readSchema('run-start.v1.schema.json');
  const receipt = readSchema('run-receipt.v1.schema.json');
  const migration = fs.readFileSync(new URL('../../../migrations/runtime/0001_cli_runtime.sql', import.meta.url), 'utf8');
  const storageStatusCheck = migration.match(/status TEXT NOT NULL DEFAULT 'queued'[\s\S]*?CHECK\s*\(status IN \(([^)]+)\)\)/i);
  assert.ok(storageStatusCheck, 'runtime run migration must constrain storage status');
  const persistedStatuses = [...storageStatusCheck[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  // The original local SQLite migration allowed legacy 'paused' rows.
  // Migration 0012 normalizes those rows to 'running'; new persisted writes
  // use the canonical D1 storage vocabulary only.
  assert.deepEqual(persistedStatuses.filter(status => status !== 'paused'), [...AGENT_RUN_STORAGE_STATUSES]);
  const parityMigration = fs.readFileSync(new URL('../../../migrations/runtime/0012_agent_run_event_sequence.sql', import.meta.url), 'utf8');
  assert.match(parityMigration, /SET status = 'running'[\\s\\S]*WHERE status = 'paused'/);
  const validateActivity = ajv.compile(activity);
  assert.deepEqual(run.properties.status.enum, [...AGENT_RUN_STATUSES]);
  assert.deepEqual(run.properties.storageStatus.enum, [...AGENT_RUN_STORAGE_STATUSES]);
  assert.deepEqual(run.properties.mode.enum, [...AGENT_RUN_MODES]);
  assert.deepEqual(run.properties.selectedBy.enum, [...AGENT_RUN_SELECTED_BY]);
  assert.deepEqual(run.$defs.suspension.properties.state.enum, [...AGENT_RUN_SUSPENSION_STATES]);
  assert.deepEqual(run.$defs.suspension.properties.reason.enum, [...AGENT_RUN_SUSPENSION_REASONS]);
  assert.equal(start.properties.status.const, 'queued');
  assert.ok(receipt.properties.lastEvent);
  const projected = projectRunEventToActivity({
    id:'evt_schema_1', runId:'run_schema_1', seq:1, eventType:'run.started',
    label:'Started', createdAt:Date.parse('2026-11-26T16:00:00.000Z'),
  });
  assert.equal(validateActivity(projected), true, ajv.errorsText(validateActivity.errors));
  assert.equal(validateActivity({ ...projected, source:{ kind:'sam' } }), false);
  assert.equal(validateActivity({ ...projected, unexpected:true }), false);
});
