import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  classifyAgentRunRetry,
  isAgentRunModelActiveStatus,
  isAgentRunTerminalStatus,
  isAgentRunWaitingStatus,
  projectRunEventToActivity,
  transitionAgentRunStatus,
  AGENT_RUN_STATUSES,
  AGENT_RUN_STORAGE_STATUSES,
  AGENT_RUN_MODES,
  AGENT_RUN_SELECTED_BY,
} from '../dist/index.js';

test('run lifecycle distinguishes stored activity from derived waiting states', () => {
  assert.equal(isAgentRunModelActiveStatus('running'), true);
  assert.equal(isAgentRunModelActiveStatus('waiting_child'), false);
  assert.equal(isAgentRunWaitingStatus('waiting_child'), true);
  assert.equal(isAgentRunWaitingStatus('awaiting_approval'), true);
  assert.equal(isAgentRunTerminalStatus('timed_out'), true);
  assert.equal(isAgentRunTerminalStatus('partial'), false);

  assert.equal(transitionAgentRunStatus('queued', { type: 'start' }), 'running');
  assert.equal(transitionAgentRunStatus('waiting_child', { type: 'wake' }), 'queued');
  assert.equal(transitionAgentRunStatus('running', { type: 'cancel' }), 'cancelled');
  assert.equal(transitionAgentRunStatus('running', { type: 'timeout' }), 'timed_out');
  assert.equal(transitionAgentRunStatus('completed', { type: 'wake' }), 'completed');
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

test('append-only run events project to agentsam.activity.v1 without suspension records', () => {
  const projected = projectRunEventToActivity({
    id: 'evt_42',
    runId: 'run_parent',
    parentRunId: 'run_root',
    seq: 42,
    eventType: 'run.status',
    status: 'waiting_child',
    phase: 'waiting',
    label: 'Waiting for child runs',
    detail: 'Child work is still active',
    createdAt: Date.parse('2026-10-03T07:00:00.000Z'),
    source: { kind: 'queue', name: 'agentsam' },
    evidence: { spawn_job_id: 'spawn_123', child_run_ids: ['run_child'] },
  });

  assert.equal(projected.schema, 'agentsam.activity.v1');
  assert.equal(projected.phase, 'waiting');
  assert.equal(projected.event, 'phase.changed');
  assert.equal(projected.parent_id, 'run_root');
  assert.equal(projected.evidence.run_event_id, 'evt_42');
  assert.equal(projected.evidence.run_event_type, 'run.status');
  assert.equal(projected.evidence.run_status, 'waiting_child');
  assert.equal(projected.evidence.spawn_job_id, 'spawn_123');
});

test('run and activity wire schemas match production storage and routing vocabularies', () => {
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
  assert.deepEqual(persistedStatuses.filter(status => status !== 'paused'), [...AGENT_RUN_STORAGE_STATUSES]);

  const validateActivity = ajv.compile(activity);
  assert.deepEqual(run.properties.status.enum, [...AGENT_RUN_STATUSES]);
  assert.deepEqual(run.properties.storageStatus.enum, [...AGENT_RUN_STORAGE_STATUSES]);
  assert.deepEqual(run.properties.mode.enum, [...AGENT_RUN_MODES]);
  assert.deepEqual(run.properties.selectedBy.enum, [...AGENT_RUN_SELECTED_BY]);
  assert.deepEqual(run.properties.selectedBy.enum, ['manual', 'automatic', 'fallback']);
  assert.equal(Object.hasOwn(run.properties, 'suspension'), false);
  assert.equal(Object.hasOwn(run.properties, 'planId'), false);
  assert.equal(Object.hasOwn(run.properties, 'todoId'), false);
  assert.equal(Object.hasOwn(receipt.properties, 'suspension'), false);
  assert.equal(Object.hasOwn(receipt.properties, 'planId'), false);
  assert.equal(Object.hasOwn(receipt.properties, 'todoId'), false);
  assert.equal(start.properties.status.const, 'queued');
  assert.ok(receipt.properties.lastEvent);

  const projected = projectRunEventToActivity({
    id: 'evt_schema_1', runId: 'run_schema_1', seq: 1, eventType: 'run.started',
    label: 'Started', createdAt: Date.parse('2026-11-26T16:00:00.000Z'),
  });
  assert.equal(validateActivity(projected), true, ajv.errorsText(validateActivity.errors));
  assert.equal(validateActivity({ ...projected, source: { kind: 'sam' } }), false);
  assert.equal(validateActivity({ ...projected, unexpected: true }), false);
});
