import { randomUUID } from 'node:crypto';
import {
  QueueControl,
  SqliteQueueAdapter,
  buildQueueTopology,
} from '../../packages/agentsam-queue-control/src/index.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function createLocalQueueControl(database) {
  return new QueueControl({
    adapter: new SqliteQueueAdapter({
      database,
      leaseOwner: 'agentsam-acp-local',
    }),
    topology: buildQueueTopology({
      namespace: 'agentsam',
      environment: 'local',
      mode: 'compact',
    }),
  });
}

async function nextEventSeq(database, runId) {
  const row = await database.prepare(
    'SELECT COALESCE(MAX(seq), -1) + 1 AS next_seq FROM agentsam_agent_run_event WHERE run_id = ?'
  ).bind(runId).first();
  return Number(row?.next_seq || 0);
}

export async function appendAgentRunEvent(database, {
  runId,
  parentRunId = null,
  eventType,
  phase = null,
  stepId = null,
  label = '',
  detail = null,
  evidence = {},
  dedupeKey = null,
  sourceKind = 'sam',
  sourceName = 'agent-control-plane',
  createdAt = Math.floor(Date.now() / 1000),
} = {}) {
  const id = clean(runId);
  const type = clean(eventType);
  if (!id) throw new TypeError('runId is required');
  if (!type) throw new TypeError('eventType is required');

  const eventId = `evt_${randomUUID()}`;
  const seq = await nextEventSeq(database, id);
  await database.prepare(`
    INSERT OR IGNORE INTO agentsam_agent_run_event (
      event_id, run_id, parent_run_id, seq, event_type, phase, step_id,
      label, detail, source_kind, source_name, evidence_json, dedupe_key,
      created_at_unix
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId,
    id,
    clean(parentRunId) || null,
    seq,
    type,
    clean(phase) || null,
    clean(stepId) || null,
    clean(label),
    detail == null ? null : String(detail),
    clean(sourceKind) || 'sam',
    clean(sourceName) || null,
    JSON.stringify(evidence && typeof evidence === 'object' ? evidence : {}),
    clean(dedupeKey) || null,
    createdAt,
  ).run();

  return {
    event_id: eventId,
    run_id: id,
    seq,
    event_type: type,
    dedupe_key: clean(dedupeKey) || null,
  };
}

async function pendingChildIds(database, parentRunId) {
  const result = await database.prepare(`
    SELECT child_run_id
    FROM agentsam_agent_run_dependency
    WHERE parent_run_id = ? AND status = 'pending'
    ORDER BY created_at_unix ASC, child_run_id ASC
  `).bind(parentRunId).all();
  return (result.results || []).map((row) => row.child_run_id);
}

export async function spawnChildRun(database, {
  parentRunId,
  childRunId = null,
  accountId = null,
  objective = '',
  role = null,
  workItemId = null,
  stepId = null,
  modelKey = null,
  reasoningEffort = null,
  serviceTier = null,
  runtimeRequirements = {},
  metadata = {},
  priority = 'normal',
} = {}) {
  const parentId = clean(parentRunId);
  if (!parentId) throw new TypeError('parentRunId is required');

  const parent = await database.prepare(
    'SELECT * FROM agentsam_agent_run WHERE id = ? LIMIT 1'
  ).bind(parentId).first();
  if (!parent) {
    const error = new Error(`parent_run_not_found:${parentId}`);
    error.code = 'parent_run_not_found';
    throw error;
  }
  if (['completed', 'failed', 'cancelled'].includes(parent.status)) {
    const error = new Error(`parent_run_terminal:${parent.status}`);
    error.code = 'parent_run_terminal';
    throw error;
  }

  const currentSuspension = await database.prepare(
    'SELECT state FROM agentsam_agent_run_suspension WHERE run_id = ? LIMIT 1'
  ).bind(parentId).first();
  if (currentSuspension && currentSuspension.state !== 'waiting_child') {
    const error = new Error(`parent_run_already_suspended:${currentSuspension.state}`);
    error.code = 'parent_run_already_suspended';
    throw error;
  }

  const childId = clean(childRunId) || `arun_${randomUUID()}`;
  const resolvedAccount = clean(accountId) || clean(parent.account_id) || 'local';
  const now = Math.floor(Date.now() / 1000);

  await database.prepare(`
    INSERT INTO agentsam_agent_run (
      id, account_id, conversation_id, parent_run_id, source_client, surface,
      mode, model_key, reasoning_effort, requested_service_tier, selected_by,
      status, created_at_unix, updated_at_unix
    ) VALUES (?, ?, ?, ?, ?, ?, 'agent', ?, ?, ?, 'automatic', 'queued', ?, ?)
  `).bind(
    childId,
    resolvedAccount,
    parent.conversation_id || null,
    parentId,
    parent.source_client || 'agentsam-acp',
    parent.surface || 'control-plane',
    clean(modelKey) || parent.model_key || null,
    clean(reasoningEffort) || parent.reasoning_effort || null,
    clean(serviceTier) || parent.requested_service_tier || null,
    now,
    now,
  ).run();

  await database.prepare(`
    INSERT INTO agentsam_agent_run_dependency (
      parent_run_id, child_run_id, relation, work_item_id, step_id, status,
      metadata_json, created_at_unix, updated_at_unix
    ) VALUES (?, ?, 'blocks', ?, ?, 'pending', ?, ?, ?)
  `).bind(
    parentId,
    childId,
    clean(workItemId) || null,
    clean(stepId) || null,
    JSON.stringify(metadata && typeof metadata === 'object' ? metadata : {}),
    now,
    now,
  ).run();

  const pending = await pendingChildIds(database, parentId);
  await database.prepare(`
    UPDATE agentsam_agent_run
    SET status = 'paused', updated_at_unix = ?
    WHERE id = ?
  `).bind(now, parentId).run();

  await database.prepare(`
    INSERT INTO agentsam_agent_run_suspension (
      run_id, state, reason, dependency_run_ids_json, resume_step_id,
      metadata_json, created_at_unix, updated_at_unix
    ) VALUES (?, 'waiting_child', 'child_run', ?, ?, ?, ?, ?)
    ON CONFLICT(run_id) DO UPDATE SET
      state = 'waiting_child',
      reason = 'child_run',
      dependency_run_ids_json = excluded.dependency_run_ids_json,
      resume_step_id = COALESCE(excluded.resume_step_id, agentsam_agent_run_suspension.resume_step_id),
      metadata_json = excluded.metadata_json,
      updated_at_unix = excluded.updated_at_unix
  `).bind(
    parentId,
    JSON.stringify(pending),
    clean(stepId) || null,
    JSON.stringify({
      child_count: pending.length,
      last_child_run_id: childId,
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
    }),
    now,
    now,
  ).run();

  await appendAgentRunEvent(database, {
    runId: childId,
    parentRunId: parentId,
    eventType: 'run.created',
    phase: 'boot',
    label: 'Child run created',
    evidence: {
      parent_run_id: parentId,
      objective: clean(objective) || null,
      role: clean(role) || null,
      work_item_id: clean(workItemId) || null,
    },
    dedupeKey: `child:${childId}:created`,
    createdAt: now,
  });
  await appendAgentRunEvent(database, {
    runId: childId,
    parentRunId: parentId,
    eventType: 'run.queued',
    phase: 'boot',
    label: 'Child run queued',
    evidence: { parent_run_id: parentId },
    dedupeKey: `child:${childId}:queued`,
    createdAt: now,
  });
  await appendAgentRunEvent(database, {
    runId: parentId,
    parentRunId: parent.parent_run_id || null,
    eventType: 'run.suspended',
    phase: 'waiting',
    stepId: clean(stepId) || null,
    label: 'Waiting for child run',
    evidence: {
      child_run_id: childId,
      dependency_run_ids: pending,
      work_item_id: clean(workItemId) || null,
    },
    dedupeKey: `wait-child:${childId}`,
    createdAt: now,
  });

  const queueControl = createLocalQueueControl(database);
  const queued = await queueControl.enqueue(
    {
      kind: 'agent.run',
      account_id: resolvedAccount,
      priority,
      payload: {
        run_id: childId,
        parent_run_id: parentId,
        objective: clean(objective) || null,
        role: clean(role) || null,
        work_item_id: clean(workItemId) || null,
        step_id: clean(stepId) || null,
        runtime_requirements: runtimeRequirements && typeof runtimeRequirements === 'object'
          ? runtimeRequirements
          : {},
      },
    },
    {
      id: `job_agent_run_${childId}`,
      account_id: resolvedAccount,
      source_run_id: childId,
      step_id: clean(stepId) || null,
      conversation_id: parent.conversation_id || null,
      idempotency_key: `agent-run:${childId}`,
      priority,
    },
  );

  return {
    schema: 'agentsam.child-run-spawn.v1',
    parent_run_id: parentId,
    child_run_id: childId,
    dependency_status: 'pending',
    pending_child_run_ids: pending,
    queue: queued.plan?.physical_queue || null,
    queue_job: queued.job,
    published: queued.published,
  };
}

export async function reconcileParentAfterChildTerminal(database, {
  runId,
  status,
  errorCode = null,
  errorMessage = null,
} = {}) {
  const childId = clean(runId);
  const childStatus = clean(status);
  if (!childId || !childStatus) return { reconciled: false, reason: 'missing_input' };
  if (!['completed', 'failed', 'cancelled', 'partial'].includes(childStatus)) {
    return { reconciled: false, reason: 'non_terminal_child_status' };
  }

  const child = await database.prepare(
    'SELECT * FROM agentsam_agent_run WHERE id = ? LIMIT 1'
  ).bind(childId).first();
  if (!child?.parent_run_id) return { reconciled: false, reason: 'no_parent' };

  const parentId = child.parent_run_id;
  const dependencyStatus = childStatus === 'completed'
    ? 'satisfied'
    : childStatus === 'cancelled'
      ? 'cancelled'
      : 'failed';
  const now = Math.floor(Date.now() / 1000);

  await database.prepare(`
    UPDATE agentsam_agent_run_dependency
    SET status = ?, completed_at_unix = ?, updated_at_unix = ?
    WHERE child_run_id = ? AND parent_run_id = ? AND status = 'pending'
  `).bind(dependencyStatus, now, now, childId, parentId).run();

  const remaining = await pendingChildIds(database, parentId);
  await appendAgentRunEvent(database, {
    runId: parentId,
    eventType: 'run.status',
    phase: 'recover',
    label: `Child run ${childStatus}`,
    evidence: {
      child_run_id: childId,
      child_status: childStatus,
      dependency_status: dependencyStatus,
      remaining_child_run_ids: remaining,
      error_code: clean(errorCode) || null,
      error_message: clean(errorMessage) || null,
    },
    dedupeKey: `child-terminal:${childId}:${childStatus}`,
    createdAt: now,
  });

  if (remaining.length > 0) {
    await database.prepare(`
      UPDATE agentsam_agent_run_suspension
      SET dependency_run_ids_json = ?, updated_at_unix = ?
      WHERE run_id = ? AND state = 'waiting_child'
    `).bind(JSON.stringify(remaining), now, parentId).run();
    return {
      reconciled: true,
      parent_run_id: parentId,
      woke_parent: false,
      dependency_status: dependencyStatus,
      remaining_child_run_ids: remaining,
    };
  }

  const parent = await database.prepare(
    'SELECT * FROM agentsam_agent_run WHERE id = ? LIMIT 1'
  ).bind(parentId).first();
  if (!parent || ['completed', 'failed', 'cancelled'].includes(parent.status)) {
    return {
      reconciled: true,
      parent_run_id: parentId,
      woke_parent: false,
      reason: 'parent_terminal',
      dependency_status: dependencyStatus,
      remaining_child_run_ids: [],
    };
  }

  await database.prepare(
    "DELETE FROM agentsam_agent_run_suspension WHERE run_id = ? AND state = 'waiting_child'"
  ).bind(parentId).run();
  await database.prepare(`
    UPDATE agentsam_agent_run
    SET status = 'queued', updated_at_unix = ?
    WHERE id = ?
  `).bind(now, parentId).run();

  await appendAgentRunEvent(database, {
    runId: parentId,
    eventType: 'run.woken',
    phase: 'recover',
    label: 'Child dependencies resolved',
    evidence: {
      completed_child_run_id: childId,
      completed_child_status: childStatus,
      resume_reason: 'child_run',
      cancel_requested: Boolean(parent.cancel_requested),
    },
    dedupeKey: `wake-child:${childId}`,
    createdAt: now,
  });

  const resolvedAccount = clean(parent.account_id) || clean(child.account_id) || 'local';
  const queueControl = createLocalQueueControl(database);
  const queued = await queueControl.enqueue(
    {
      kind: 'agent.resume',
      account_id: resolvedAccount,
      payload: {
        run_id: parentId,
        wake_reason: 'child_run',
        completed_child_run_id: childId,
        completed_child_status: childStatus,
        cancel_requested: Boolean(parent.cancel_requested),
      },
    },
    {
      id: `job_agent_resume_${parentId}_${childId}`,
      account_id: resolvedAccount,
      source_run_id: parentId,
      conversation_id: parent.conversation_id || null,
      idempotency_key: `agent-resume:${parentId}:after:${childId}`,
      priority: parent.cancel_requested ? 'high' : 'normal',
    },
  );

  return {
    reconciled: true,
    parent_run_id: parentId,
    woke_parent: true,
    dependency_status: dependencyStatus,
    remaining_child_run_ids: [],
    resume_job: queued.job,
    queue: queued.plan?.physical_queue || null,
  };
}
