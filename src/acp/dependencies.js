import { randomUUID } from 'node:crypto';
import { AGENT_RUN_STORAGE_STATUSES } from '@inneranimalmedia/agentsam-contracts/run';
import {
  QueueControl,
  SqliteQueueAdapter,
  buildQueueTopology,
} from '../../packages/agentsam-queue-control/src/index.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

export function createDatabaseQueueControl(database, {
  environment = 'local',
  leaseOwner = 'agentsam-acp-local',
  provider = 'sqlite',
} = {}) {
  return new QueueControl({
    adapter: new SqliteQueueAdapter({ database, leaseOwner, provider }),
    topology: buildQueueTopology({
      namespace: 'agentsam',
      environment,
      mode: 'compact',
    }),
  });
}

export function createLocalQueueControl(database) {
  return createDatabaseQueueControl(database, {
    environment: 'local',
    leaseOwner: 'agentsam-acp-local',
    provider: 'sqlite',
  });
}

export function createD1QueueControl(database, options = {}) {
  const environment = clean(options.environment) || 'production';
  return createDatabaseQueueControl(database, {
    environment,
    leaseOwner: clean(options.leaseOwner) || `agentsam-acp-d1-${environment}`,
    provider: 'cloudflare-d1',
  });
}

async function nextEventSeq(database, runId) {
  const row = await database.prepare(`
    UPDATE agentsam_agent_run
    SET event_seq = MAX(
      event_seq,
      COALESCE((
        SELECT MAX(seq)
        FROM agentsam_agent_run_event
        WHERE run_id = ?
      ), -1)
    ) + 1
    WHERE id = ?
    RETURNING event_seq
  `).bind(runId, runId).first();
  if (!row) throw new Error(`agent_run_not_found:${runId}`);
  return Number(row.event_seq);
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

  const normalizedDedupeKey = clean(dedupeKey) || null;
  if (normalizedDedupeKey) {
    const existing = await database.prepare(
      'SELECT event_id, run_id, seq, event_type, dedupe_key FROM agentsam_agent_run_event WHERE run_id = ? AND dedupe_key = ? LIMIT 1'
    ).bind(id, normalizedDedupeKey).first();
    if (existing) return { ...existing, inserted: false };
  }

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
    normalizedDedupeKey,
    createdAt,
  ).run();

  if (normalizedDedupeKey) {
    const persisted = await database.prepare(
      'SELECT event_id, run_id, seq, event_type, dedupe_key FROM agentsam_agent_run_event WHERE run_id = ? AND dedupe_key = ? LIMIT 1'
    ).bind(id, normalizedDedupeKey).first();
    if (persisted) return { ...persisted, inserted: persisted.event_id === eventId };
  }

  return {
    event_id: eventId,
    run_id: id,
    seq,
    event_type: type,
    dedupe_key: normalizedDedupeKey,
    inserted: true,
  };
}

/**
 * Persist a timeout without widening the runtime table's storage-status CHECK.
 * The storage row becomes failed; the append-only event preserves timed_out as
 * the public lifecycle outcome. Repeated calls are idempotent by dedupe key.
 */
export async function recordAgentRunTimeout(database, {
  runId,
  accountId = null,
  errorCode = 'run_timeout',
  errorMessage = 'Agent run timed out',
  createdAt = Math.floor(Date.now() / 1000),
} = {}) {
  const id = clean(runId);
  if (!id) throw new TypeError('runId is required');
  const owner = clean(accountId);
  const runQuery = database.prepare(
    'SELECT id, parent_run_id, status FROM agentsam_agent_run WHERE id = ?'
      + (owner ? ' AND account_id = ?' : '')
      + ' LIMIT 1'
  );
  const run = owner
    ? await runQuery.bind(id, owner).first()
    : await runQuery.bind(id).first();
  if (!run) {
    const error = new Error(`agent_run_not_found:${id}`);
    error.code = 'agent_run_not_found';
    throw error;
  }
  if (run.status === 'completed' || run.status === 'cancelled') {
    return { recorded: false, reason: 'run_already_terminal', runId: id, status: run.status, storageStatus: run.status };
  }
  if (!AGENT_RUN_STORAGE_STATUSES.includes(run.status)) {
    throw new Error(`agent_run_storage_status_invalid:${run.status}`);
  }

  const code = clean(errorCode) || 'run_timeout';
  const message = clean(errorMessage) || 'Agent run timed out';
  const timestamp = Number.isFinite(Number(createdAt)) ? Math.trunc(Number(createdAt)) : Math.floor(Date.now() / 1000);
  const dedupeKey = `run:${id}:timed_out`;
  const existing = await database.prepare(
    'SELECT event_id, seq, event_type, dedupe_key FROM agentsam_agent_run_event WHERE run_id = ? AND dedupe_key = ? LIMIT 1'
  ).bind(id, dedupeKey).first();

  const updateSql = `
    UPDATE agentsam_agent_run
    SET status = 'failed', error_code = ?, error_message = ?,
        completed_at_unix = COALESCE(completed_at_unix, ?), updated_at_unix = ?
    WHERE id = ? AND status IN ('queued','running','failed','partial')
  ` + (owner ? ' AND account_id = ?' : '');
  const update = database.prepare(updateSql);
  if (owner) await update.bind(code, message, timestamp, timestamp, id, owner).run();
  else await update.bind(code, message, timestamp, timestamp, id).run();

  let event = existing;
  let recorded = false;
  if (!existing) {
    const appended = await appendAgentRunEvent(database, {
      runId: id,
      parentRunId: run.parent_run_id ?? null,
      eventType: 'run.timed_out',
      phase: 'complete',
      label: 'Run timed out',
      detail: message,
      evidence: { error_code: code, storage_status: 'failed' },
      dedupeKey,
      createdAt: timestamp,
    });
    event = await database.prepare(
      'SELECT event_id, seq, event_type, dedupe_key FROM agentsam_agent_run_event WHERE run_id = ? AND dedupe_key = ? LIMIT 1'
    ).bind(id, dedupeKey).first() || appended;
    recorded = Boolean(appended.inserted);
  }

  return {
    recorded,
    runId: id,
    status: 'timed_out',
    storageStatus: 'failed',
    event,
    errorCode: code,
    createdAt: timestamp,
  };
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function sanitize(value, key = '') {
  if (/(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|authorization|cookie|private[_-]?key)/i.test(key)) return '[redacted]';
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, sanitize(child, name)]));
  }
  return typeof value === 'string' ? value.slice(0, 20000) : value;
}

const APPROVAL_TYPES = new Set([
  'tool', 'workflow', 'command', 'script', 'deploy', 'db_write',
  'r2_write', 'github_write', 'terminal', 'hook', 'spawn',
  'escalation', 'route_upgrade',
]);
const RISK_LEVELS = new Set(['low', 'medium', 'high', 'critical']);

function mapApproval(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    sessionId: row.session_id ?? undefined,
    conversationId: row.conversation_id ?? undefined,
    runId: row.agent_run_id ?? undefined,
    toolCallId: row.tool_call_id ?? undefined,
    terminalJobId: row.terminal_job_id ?? undefined,
    executionStepId: row.execution_step_id ?? undefined,
    capabilityKey: row.capability_key ?? undefined,
    workflowKey: row.workflow_key ?? undefined,
    toolName: row.tool_name ?? undefined,
    toolId: row.tool_id ?? undefined,
    toolKey: row.tool_key ?? undefined,
    handlerKey: row.handler_key ?? undefined,
    routeKey: row.route_key ?? undefined,
    actionSummary: row.action_summary,
    sanitizedInput: parseJson(row.sanitized_input_json, {}),
    response: parseJson(row.response_json, {}),
    metadata: parseJson(row.metadata_json, {}),
    riskLevel: row.risk_level,
    approvalType: row.approval_type,
    status: row.status,
    approvedBy: row.approved_by ?? undefined,
    decidedAt: row.decided_at == null ? undefined : Number(row.decided_at) * 1000,
    expiresAt: row.expires_at == null ? undefined : Number(row.expires_at) * 1000,
    notifiedAt: row.notified_at == null ? undefined : Number(row.notified_at) * 1000,
    haltedAt: row.halted_at == null ? undefined : Number(row.halted_at) * 1000,
    createdAt: row.created_at == null ? undefined : Number(row.created_at) * 1000,
  };
}

async function readApproval(database, id, accountId) {
  const owner = clean(accountId);
  const query = database.prepare(
    'SELECT * FROM agentsam_approval_queue WHERE id = ?' +
    (owner ? ' AND account_id = ?' : '') + ' LIMIT 1'
  );
  return owner ? query.bind(id, owner).first() : query.bind(id).first();
}

export async function requestAgentApproval(database, input = {}) {
  const accountId = clean(input.account_id || input.accountId);
  if (!accountId) {
    const error = new Error('approval_account_required');
    error.code = 'approval_account_required';
    error.status = 401;
    throw error;
  }
  const runId = clean(input.agent_run_id || input.run_id || input.runId) || null;
  const stepId = clean(input.execution_step_id || input.step_id || input.stepId) || null;
  if (runId) {
    const run = await database.prepare(
      'SELECT id FROM agentsam_agent_run WHERE id = ? AND account_id = ? LIMIT 1'
    ).bind(runId, accountId).first();
    if (!run) {
      const error = new Error('agent_run_not_found:' + runId);
      error.code = 'agent_run_not_found';
      throw error;
    }
  }
  if (stepId) {
    const step = await database.prepare(
      'SELECT id FROM agentsam_execution_steps WHERE id = ? AND account_id = ? LIMIT 1'
    ).bind(stepId, accountId).first();
    if (!step) {
      const error = new Error('execution_step_not_found:' + stepId);
      error.code = 'execution_step_not_found';
      throw error;
    }
  }
  const type = clean(input.approval_type || input.approvalType) || 'tool';
  const risk = clean(input.risk_level || input.riskLevel) || 'medium';
  if (!APPROVAL_TYPES.has(type)) {
    const error = new TypeError('approval_type_invalid');
    error.code = 'approval_type_invalid';
    throw error;
  }
  if (!RISK_LEVELS.has(risk)) {
    const error = new TypeError('approval_risk_level_invalid');
    error.code = 'approval_risk_level_invalid';
    throw error;
  }
  const toolCallId = clean(input.tool_call_id || input.toolCallId) || null;
  if (toolCallId) {
    const existingToolApproval = await database.prepare(
      'SELECT * FROM agentsam_approval_queue WHERE account_id = ? AND tool_call_id = ? AND approval_type = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(accountId, toolCallId, type).first();
    if (existingToolApproval) return mapApproval(existingToolApproval);
  }
  const summary = clean(input.action_summary || input.actionSummary);
  if (!summary) {
    const error = new TypeError('approval_action_summary_required');
    error.code = 'approval_action_summary_required';
    throw error;
  }
  const id = clean(input.id) || 'appr_' + randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresInput = input.expires_at ?? input.expiresAt;
  const expiresAt = Number.isFinite(Number(expiresInput))
    ? Math.max(now + 1, Math.trunc(Number(expiresInput)))
    : now + 300;
  const existing = await readApproval(database, id, accountId);
  if (existing) return mapApproval(existing);

  await database.prepare(
    'INSERT INTO agentsam_approval_queue (' +
    'id, account_id, session_id, conversation_id, agent_run_id, tool_call_id, terminal_job_id, ' +
    'execution_step_id, capability_key, workflow_key, tool_name, tool_id, tool_key, handler_key, route_key, ' +
    'action_summary, sanitized_input_json, response_json, metadata_json, risk_level, approval_type, status, expires_at, created_at' +
    ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id, accountId,
    clean(input.session_id || input.sessionId) || null,
    clean(input.conversation_id || input.conversationId) || null,
    runId,
    toolCallId,
    clean(input.terminal_job_id || input.terminalJobId) || null,
    stepId,
    clean(input.capability_key || input.capabilityKey) || null,
    clean(input.workflow_key || input.workflowKey) || null,
    clean(input.tool_name || input.toolName) || null,
    clean(input.tool_id || input.toolId) || null,
    clean(input.tool_key || input.toolKey) || null,
    clean(input.handler_key || input.handlerKey) || null,
    clean(input.route_key || input.routeKey) || null,
    summary.slice(0, 500),
    JSON.stringify(sanitize(object(input.sanitized_input || input.sanitizedInput))),
    '{}',
    JSON.stringify(sanitize(object(input.metadata))),
    risk,
    type,
    'pending',
    expiresAt,
    now,
  ).run();

  if (stepId) {
    await database.prepare(
      "UPDATE agentsam_execution_steps SET status = 'approval_pending', approval_id = ? WHERE id = ? AND account_id = ?"
    ).bind(id, stepId, accountId).run();
  }
  if (runId) {
    await appendAgentRunEvent(database, {
      runId,
      eventType: 'approval.required',
      phase: 'waiting',
      stepId,
      label: 'Approval required',
      detail: summary,
      evidence: { approval_id: id, approval_type: type, risk_level: risk },
      dedupeKey: 'approval:' + id + ':required',
      createdAt: now,
    });
  }
  return mapApproval(await readApproval(database, id, accountId));
}

export async function getAgentApproval(database, id, accountId = null) {
  const row = await readApproval(database, clean(id), accountId);
  if (!row) return null;
  if (row.status === 'pending' && row.expires_at != null && Number(row.expires_at) <= Math.floor(Date.now() / 1000)) {
    await database.prepare(
      "UPDATE agentsam_approval_queue SET status = 'expired', decided_at = ? WHERE id = ? AND status = 'pending'"
    ).bind(Math.floor(Date.now() / 1000), row.id).run();
    const metadata = parseJson(row.metadata_json, {});
    const spawnJobId = clean(metadata.spawn_job_id);
    if (spawnJobId) {
      await database.prepare(
        "UPDATE agentsam_spawn_job SET status = 'failed', error_message = 'Spawn approval expired', completed_at = datetime('now') WHERE id = ? AND account_id = ? AND status = 'awaiting_approval'"
      ).bind(spawnJobId, row.account_id).run();
    }
    await wakeRunAfterApproval(database, row, { decision: 'expired' });
    return mapApproval(await readApproval(database, row.id, accountId));
  }
  return mapApproval(row);
}

export async function listAgentApprovals(database, {
  accountId = null,
  runId = null,
  status = 'pending',
  limit = 100,
} = {}) {
  const owner = clean(accountId);
  if (!owner) {
    const error = new Error('approval_account_required');
    error.code = 'approval_account_required';
    error.status = 401;
    throw error;
  }
  const now = Math.floor(Date.now() / 1000);
  await database.prepare(
    "UPDATE agentsam_approval_queue SET status = 'expired', decided_at = ? WHERE account_id = ? AND status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ?"
  ).bind(now, owner, now).run();
  await database.prepare(
    "UPDATE agentsam_spawn_job SET status = 'failed', error_message = 'Spawn approval expired', completed_at = datetime('now') WHERE account_id = ? AND status = 'awaiting_approval' AND id IN (SELECT json_extract(metadata_json, '$.spawn_job_id') FROM agentsam_approval_queue WHERE account_id = ? AND approval_type = 'spawn' AND status = 'expired')"
  ).bind(owner, owner).run();
  const expiredApprovals = await database.prepare(
    'SELECT * FROM agentsam_approval_queue WHERE account_id = ? AND status = \'expired\' AND decided_at = ? AND agent_run_id IS NOT NULL'
  ).bind(owner, now).all();
  for (const expired of expiredApprovals.results || []) {
    await wakeRunAfterApproval(database, expired, { decision: 'expired' });
  }
  const params = [owner];
  let where = 'account_id = ?';
  if (clean(runId)) { where += ' AND agent_run_id = ?'; params.push(clean(runId)); }
  if (clean(status) && status !== 'all') { where += ' AND status = ?'; params.push(clean(status)); }
  params.push(Math.max(1, Math.min(500, Math.trunc(Number(limit) || 100))));
  const result = await database.prepare(
    'SELECT * FROM agentsam_approval_queue WHERE ' + where + ' ORDER BY created_at DESC, id DESC LIMIT ?'
  ).bind(...params).all();
  return (result.results || []).map(mapApproval);
}

async function spawnChildrenForJob(database, {
  spawnJob,
  accountId,
  children = [],
  objective = '',
  role = null,
  workItemId = null,
  stepId = null,
  runtimeRequirements = {},
  metadata = {},
  priority = 'normal',
  selectedBy = null,
  routingArmId = null,
  reasoningEffort = null,
  serviceTier = null,
  queueControl = null,
} = {}) {
  const parentId = clean(spawnJob.master_run_id);
  const owner = clean(accountId || spawnJob.account_id);
  const now = Math.floor(Date.now() / 1000);
  const queue = queueControl || createLocalQueueControl(database);
  const specs = Array.isArray(children) && children.length ? children.map(object) : [{
    objective, role, work_item_id: workItemId, step_id: stepId,
    runtime_requirements: runtimeRequirements, metadata, selected_by: selectedBy,
    routing_arm_id: routingArmId, reasoning_effort: reasoningEffort, service_tier: serviceTier,
  }];
  const parent = await database.prepare(
    'SELECT * FROM agentsam_agent_run WHERE id = ? AND account_id = ? LIMIT 1'
  ).bind(parentId, owner).first();
  if (!parent) {
    const error = new Error('parent_run_not_found:' + parentId);
    error.code = 'parent_run_not_found';
    throw error;
  }
  if (['completed', 'failed', 'cancelled'].includes(parent.status)) {
    const error = new Error('parent_run_terminal:' + parent.status);
    error.code = 'parent_run_terminal';
    throw error;
  }

  const childIds = [];
  const queuedJobs = [];
  for (const spec of specs) {
    const childId = clean(spec.child_run_id || spec.childRunId) || 'arun_' + randomUUID();
    const childObjective = clean(spec.objective || spec.task_description) || clean(objective) || 'Run child AgentSam ' + childId;
    const childRole = clean(spec.role || spec.role_slug) || clean(role) || 'agentsam-child';
    const childWorkItem = clean(spec.work_item_id || spec.workItemId || workItemId) || null;
    const childStep = clean(spec.step_id || spec.stepId || stepId) || null;
    const childRequirements = object(spec.runtime_requirements || spec.runtimeRequirements || runtimeRequirements);
    const childMetadata = sanitize(object(spec.metadata || metadata));
    const selected = clean(spec.selected_by || spec.selectedBy || selectedBy);
    const storedSelected = selected === 'automatic' || selected === 'thompson' ? 'thompson'
      : (selected === 'manual' || selected === 'fallback' ? selected : null);
    const modelKey = clean(spec.model_key || spec.modelKey) || null;
    const effort = clean(spec.reasoning_effort || spec.reasoningEffort || reasoningEffort || parent.reasoning_effort) || null;
    const tier = clean(spec.service_tier || spec.serviceTier || serviceTier || parent.requested_service_tier) || null;
    const existing = await database.prepare(
      'SELECT id, account_id, parent_run_id FROM agentsam_agent_run WHERE id = ? LIMIT 1'
    ).bind(childId).first();
    if (existing) {
      if (existing.account_id !== owner || existing.parent_run_id !== parentId) {
        const error = new Error('child_run_id_conflict:' + childId);
        error.code = 'child_run_id_conflict';
        throw error;
      }
    } else {
      await database.prepare(
        'INSERT INTO agentsam_agent_run (' +
        'id, account_id, conversation_id, parent_run_id, source_client, surface, mode, model_key, ' +
        'reasoning_effort, requested_service_tier, selected_by, routing_arm_id, status, created_at_unix, updated_at_unix' +
        ") VALUES (?, ?, ?, ?, ?, ?, 'agent', ?, ?, ?, ?, ?, 'queued', ?, ?)"
      ).bind(
        childId, owner, parent.conversation_id || null, parentId,
        parent.source_client || 'agentsam-acp', parent.surface || 'control-plane',
        modelKey, effort, tier, storedSelected,
        clean(spec.routing_arm_id || spec.routingArmId || routingArmId) || null,
        now, now,
      ).run();
    }
    const existingEvent = await database.prepare(
      "SELECT event_id FROM agentsam_agent_run_event WHERE run_id = ? AND event_type = 'run.created' AND json_extract(evidence_json, '$.spawn_job_id') = ? LIMIT 1"
    ).bind(childId, spawnJob.id).first();
    if (!existingEvent) {
      await appendAgentRunEvent(database, {
        runId: childId,
        parentRunId: parentId,
        eventType: 'run.created',
        phase: 'boot',
        label: 'Child run created',
        evidence: {
          spawn_job_id: spawnJob.id,
          parent_run_id: parentId,
          objective: childObjective,
          role: childRole,
          work_item_id: childWorkItem,
          step_id: childStep,
          metadata: childMetadata,
        },
        dedupeKey: 'spawn:' + spawnJob.id + ':child:' + childId + ':created',
        createdAt: now,
      });
      await appendAgentRunEvent(database, {
        runId: childId,
        parentRunId: parentId,
        eventType: 'run.queued',
        phase: 'boot',
        label: 'Child run queued',
        evidence: { spawn_job_id: spawnJob.id, parent_run_id: parentId },
        dedupeKey: 'spawn:' + spawnJob.id + ':child:' + childId + ':queued',
        createdAt: now,
      });
    }
    const queued = await queue.enqueue(
      {
        kind: 'agent.run',
        account_id: owner,
        priority: clean(spec.priority) || priority || 'normal',
        payload: {
          run_id: childId, parent_run_id: parentId, spawn_job_id: spawnJob.id,
          objective: childObjective, role: childRole, work_item_id: childWorkItem,
          step_id: childStep, runtime_requirements: childRequirements, metadata: childMetadata,
        },
      },
      {
        id: 'job_agent_run_' + childId,
        account_id: owner,
        source_run_id: childId,
        step_id: childStep,
        conversation_id: parent.conversation_id || null,
        idempotency_key: 'agent-run:' + childId,
        priority: clean(spec.priority) || priority || 'normal',
      },
    );
    childIds.push(childId);
    queuedJobs.push(queued);
  }

  await database.prepare(
    "UPDATE agentsam_spawn_job SET status = 'running', chunk_count = ?, subagents_spawned = ?, started_at = COALESCE(started_at, datetime('now')), error_message = NULL WHERE id = ? AND account_id = ?"
  ).bind(childIds.length, childIds.length, spawnJob.id, owner).run();
  await database.prepare(
    "UPDATE agentsam_agent_run SET status = 'running', updated_at_unix = ? WHERE id = ? AND account_id = ? AND status IN ('queued','running')"
  ).bind(now, parentId, owner).run();
  await appendAgentRunEvent(database, {
    runId: parentId,
    eventType: 'run.status',
    phase: 'waiting',
    stepId: clean(stepId) || null,
    label: 'Waiting for child runs',
    evidence: { spawn_job_id: spawnJob.id, child_run_ids: childIds, child_count: childIds.length, work_item_id: clean(workItemId) || null },
    dedupeKey: 'spawn:' + spawnJob.id + ':children:queued',
    createdAt: now,
  });
  return {
    schema: 'agentsam.child-run-spawn.v1',
    parent_run_id: parentId,
    spawn_job_id: spawnJob.id,
    status: 'running',
    child_run_id: childIds.length === 1 ? childIds[0] : undefined,
    child_run_ids: childIds,
    dependency_status: 'pending',
    pending_child_run_ids: childIds,
    queue: queuedJobs[0]?.plan?.physical_queue || null,
    queue_job: queuedJobs[0]?.job || null,
    queue_jobs: queuedJobs.map((item) => item.job),
    published: queuedJobs.every((item) => item.published),
  };
}

export async function spawnChildRun(database, {
  parentRunId, childRunId = null, spawnJobId = null, accountId = null,
  initiatedByType = 'user', initiatedById = null, objective = '', role = null,
  children = [], workItemId = null, stepId = null, modelKey = null,
  selectedBy = null, routingArmId = null, reasoningEffort = null, serviceTier = null,
  runtimeRequirements = {}, metadata = {}, priority = 'normal',
  chunkingStrategy = 'manual', mergeStrategy = 'concat', mergeInstructions = null,
  costCapUsd = null, requiresApproval = false, approvalExpiresAt = null,
  queueControl = null,
} = {}) {
  const parentId = clean(parentRunId);
  if (!parentId) throw new TypeError('parentRunId is required');
  const owner = clean(accountId);
  const query = database.prepare(
    'SELECT * FROM agentsam_agent_run WHERE id = ?' + (owner ? ' AND account_id = ?' : '') + ' LIMIT 1'
  );
  const parent = owner ? await query.bind(parentId, owner).first() : await query.bind(parentId).first();
  if (!parent) {
    const error = new Error('parent_run_not_found:' + parentId);
    error.code = 'parent_run_not_found';
    throw error;
  }
  if (['completed', 'failed', 'cancelled'].includes(parent.status)) {
    const error = new Error('parent_run_terminal:' + parent.status);
    error.code = 'parent_run_terminal';
    throw error;
  }
  const resolvedAccount = owner || clean(parent.account_id);
  if (!resolvedAccount) {
    const error = new Error('spawn_account_required');
    error.code = 'spawn_account_required';
    throw error;
  }
  const spawnId = clean(spawnJobId) || 'spawn_' + randomUUID();
  const specs = Array.isArray(children) && children.length ? children.map(object) : [{
    child_run_id: childRunId, objective, role, work_item_id: workItemId, step_id: stepId,
    model_key: modelKey, selected_by: selectedBy, routing_arm_id: routingArmId,
    reasoning_effort: reasoningEffort, service_tier: serviceTier,
    runtime_requirements: runtimeRequirements, metadata,
  }];
  if (specs.length > 100) {
    const error = new RangeError('spawn_child_limit_exceeded');
    error.code = 'spawn_child_limit_exceeded';
    throw error;
  }
  const existing = await database.prepare(
    'SELECT * FROM agentsam_spawn_job WHERE id = ? AND account_id = ? LIMIT 1'
  ).bind(spawnId, resolvedAccount).first();
  if (existing) {
    const childRows = await database.prepare(
      "SELECT r.id FROM agentsam_agent_run r WHERE r.parent_run_id = ? AND r.account_id = ? AND EXISTS (SELECT 1 FROM agentsam_agent_run_event e WHERE e.run_id = r.id AND e.event_type = 'run.created' AND json_extract(e.evidence_json, '$.spawn_job_id') = ?) ORDER BY r.created_at_unix, r.id"
    ).bind(parentId, resolvedAccount, spawnId).all();
    const approval = await database.prepare(
      "SELECT id FROM agentsam_approval_queue WHERE account_id = ? AND json_extract(metadata_json, '$.spawn_job_id') = ? ORDER BY created_at DESC LIMIT 1"
    ).bind(resolvedAccount, spawnId).first();
    const ids = (childRows.results || []).map((row) => row.id);
    return {
      schema: 'agentsam.child-run-spawn.v1', parent_run_id: parentId,
      spawn_job_id: spawnId, status: existing.status,
      child_run_id: ids.length === 1 ? ids[0] : undefined,
      child_run_ids: ids, approval_id: approval?.id,
      queue_job: null, queue_jobs: [], published: false,
    };
  }
  const taskDescription = clean(objective) ||
    specs.map((item) => clean(item.objective || item.task_description)).filter(Boolean).join('\n') ||
    'Spawn ' + specs.length + ' child agent(s)';
  const awaiting = Boolean(requiresApproval);
  await database.prepare(
    'INSERT INTO agentsam_spawn_job (id, account_id, master_run_id, initiated_by_type, initiated_by_id, task_description, chunking_strategy, chunk_count, merge_strategy, merge_instructions, status, cost_cap_usd, created_at) ' +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
  ).bind(
    spawnId, resolvedAccount, parentId,
    initiatedByType === 'api_credential' ? 'api_credential' : 'user',
    clean(initiatedById) || resolvedAccount,
    taskDescription.slice(0, 20000),
    ['manual', 'by_file', 'by_function', 'by_token', 'by_row', 'by_section'].includes(chunkingStrategy) ? chunkingStrategy : 'manual',
    specs.length,
    ['concat', 'json_merge', 'vote', 'first_success', 'custom'].includes(mergeStrategy) ? mergeStrategy : 'concat',
    clean(mergeInstructions) || null,
    awaiting ? 'awaiting_approval' : 'pending',
    Number.isFinite(Number(costCapUsd)) ? Math.max(0, Number(costCapUsd)) : null,
  ).run();

  if (awaiting) {
    const approval = await requestAgentApproval(database, {
      account_id: resolvedAccount,
      conversation_id: parent.conversation_id || null,
      agent_run_id: parentId,
      action_summary: 'Spawn ' + specs.length + ' child agent(s): ' + taskDescription.slice(0, 350),
      sanitized_input: { spawn_job_id: spawnId, children: specs },
      metadata: {
        spawn_job_id: spawnId,
        spawn: {
          children: specs, objective, role, work_item_id: workItemId, step_id: stepId,
          runtime_requirements: runtimeRequirements, metadata, priority,
          selected_by: selectedBy, routing_arm_id: routingArmId,
          reasoning_effort: reasoningEffort, service_tier: serviceTier,
        },
      },
      risk_level: 'medium',
      approval_type: 'spawn',
      expires_at: approvalExpiresAt,
    });
    return {
      schema: 'agentsam.child-run-spawn.v1', parent_run_id: parentId,
      spawn_job_id: spawnId, status: 'awaiting_approval',
      approval_id: approval.id, child_run_ids: [],
      queue_job: null, queue_jobs: [], published: false,
    };
  }
  const spawnJob = await database.prepare(
    'SELECT * FROM agentsam_spawn_job WHERE id = ? AND account_id = ? LIMIT 1'
  ).bind(spawnId, resolvedAccount).first();
  return spawnChildrenForJob(database, {
    spawnJob, accountId: resolvedAccount, children: specs, objective, role,
    workItemId, stepId, runtimeRequirements, metadata, priority, selectedBy,
    routingArmId, reasoningEffort, serviceTier, queueControl,
  });
}


async function wakeRunAfterApproval(database, row, {
  decision,
  queueControl = null,
} = {}) {
  const runId = clean(row?.agent_run_id);
  const accountId = clean(row?.account_id);
  if (!runId || !accountId) return null;
  const now = Math.floor(Date.now() / 1000);
  const counts = await database.prepare(
    "SELECT (SELECT COUNT(*) FROM agentsam_approval_queue WHERE agent_run_id = ? AND account_id = ? AND status = 'pending' AND (expires_at IS NULL OR expires_at > ?)) AS pending_approvals, (SELECT COUNT(*) FROM agentsam_agent_run WHERE parent_run_id = ? AND account_id = ? AND status IN ('queued','running')) AS active_children"
  ).bind(runId, accountId, now, runId, accountId).first();
  if (Number(counts?.pending_approvals || 0) > 0 || Number(counts?.active_children || 0) > 0) {
    return { woke: false, reason: 'other_work_still_pending' };
  }
  const run = await database.prepare(
    'SELECT * FROM agentsam_agent_run WHERE id = ? AND account_id = ? LIMIT 1'
  ).bind(runId, accountId).first();
  if (!run || ['completed', 'failed', 'cancelled'].includes(run.status)) {
    return { woke: false, reason: 'run_terminal' };
  }
  await database.prepare(
    "UPDATE agentsam_agent_run SET status = 'queued', updated_at_unix = ? WHERE id = ? AND account_id = ? AND status IN ('running','queued')"
  ).bind(now, runId, accountId).run();
  await appendAgentRunEvent(database, {
    runId,
    eventType: 'run.woken',
    phase: 'recover',
    label: 'Approval decision received',
    evidence: {
      approval_id: row.id,
      approval_type: row.approval_type,
      approval_decision: decision,
      tool_call_id: row.tool_call_id || null,
    },
    dedupeKey: 'wake-approval:' + row.id,
    createdAt: now,
  });
  const queue = queueControl || createLocalQueueControl(database);
  const queued = await queue.enqueue(
    {
      kind: 'agent.resume',
      account_id: accountId,
      payload: {
        run_id: runId,
        wake_reason: 'approval',
        approval_id: row.id,
        approval_type: row.approval_type,
        decision,
        tool_call_id: row.tool_call_id || null,
      },
    },
    {
      id: 'job_agent_resume_' + runId + '_approval_' + row.id,
      account_id: accountId,
      source_run_id: runId,
      idempotency_key: 'agent-resume:' + runId + ':approval:' + row.id,
      priority: decision === 'denied' || decision === 'expired' ? 'high' : 'normal',
    },
  );
  return { woke: true, resume_job: queued.job, queue: queued.plan?.physical_queue || null };
}

export async function decideAgentApproval(database, {
  id, accountId, actorId = null, decision, reason = '', queueControl = null,
} = {}) {
  const approvalId = clean(id);
  const owner = clean(accountId);
  const choice = clean(decision).toLowerCase();
  if (!approvalId) throw new TypeError('approval_id_required');
  if (!owner) {
    const error = new Error('approval_account_required');
    error.code = 'approval_account_required';
    error.status = 401;
    throw error;
  }
  if (!['approved', 'denied'].includes(choice)) {
    const error = new TypeError('approval_decision_invalid');
    error.code = 'approval_decision_invalid';
    throw error;
  }
  const row = await readApproval(database, approvalId, owner);
  if (!row) return null;
  if (row.status !== 'pending') {
    if (row.status === choice) {
      let recoveredSpawn = null;
      const decidedMetadata = parseJson(row.metadata_json, {});
      const decidedSpawnId = clean(decidedMetadata.spawn_job_id);
      if (choice === 'approved' && decidedSpawnId) {
        const decidedSpawnJob = await database.prepare(
          'SELECT * FROM agentsam_spawn_job WHERE id = ? AND account_id = ? LIMIT 1'
        ).bind(decidedSpawnId, owner).first();
        if (decidedSpawnJob && ['pending', 'awaiting_approval'].includes(decidedSpawnJob.status)) {
          const spec = object(decidedMetadata.spawn);
          recoveredSpawn = await spawnChildrenForJob(database, {
            spawnJob: decidedSpawnJob, accountId: owner, children: spec.children,
            objective: spec.objective, role: spec.role, workItemId: spec.work_item_id,
            stepId: spec.step_id, runtimeRequirements: spec.runtime_requirements,
            metadata: spec.metadata, priority: spec.priority, selectedBy: spec.selected_by,
            routingArmId: spec.routing_arm_id, reasoningEffort: spec.reasoning_effort,
            serviceTier: spec.service_tier, queueControl,
          });
        }
      }
      const resumed = recoveredSpawn ? null : await wakeRunAfterApproval(database, row, { decision: choice, queueControl });
      return { approval: mapApproval(row), spawn: recoveredSpawn, resume: resumed, idempotent: true };
    }
    const error = new Error('approval_already_decided:' + row.status);
    error.code = 'approval_already_decided';
    error.status = 409;
    throw error;
  }
  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at != null && Number(row.expires_at) <= now) {
    await database.prepare(
      "UPDATE agentsam_approval_queue SET status = 'expired' WHERE id = ? AND account_id = ? AND status = 'pending'"
    ).bind(approvalId, owner).run();
    const expiredMetadata = parseJson(row.metadata_json, {});
    if (clean(expiredMetadata.spawn_job_id)) {
      await database.prepare(
        "UPDATE agentsam_spawn_job SET status = 'failed', error_message = 'Spawn approval expired', completed_at = datetime('now') WHERE id = ? AND account_id = ? AND status = 'awaiting_approval'"
      ).bind(expiredMetadata.spawn_job_id, owner).run();
    }
    const error = new Error('approval_expired');
    error.code = 'approval_expired';
    error.status = 409;
    throw error;
  }
  const decidedBy = clean(actorId) || owner;
  const response = {
    decision: choice, reason: clean(reason).slice(0, 1000) || null,
    decided_by: decidedBy, decided_at: now,
  };
  const updated = await database.prepare(
    "UPDATE agentsam_approval_queue SET status = ?, approved_by = ?, decided_at = ?, response_json = ?, halted_at = CASE WHEN ? = 'denied' THEN ? ELSE halted_at END WHERE id = ? AND account_id = ? AND status = 'pending' AND (expires_at IS NULL OR expires_at > ?)"
  ).bind(choice, decidedBy, now, JSON.stringify(response), choice, now, approvalId, owner, now).run();
  if (!Number(updated.changes || 0)) {
    const latest = await readApproval(database, approvalId, owner);
    if (latest?.status === choice) return { approval: mapApproval(latest), spawn: null, idempotent: true };
    const error = new Error(latest?.status === 'expired' ? 'approval_expired' : 'approval_decision_conflict');
    error.code = latest?.status === 'expired' ? 'approval_expired' : 'approval_decision_conflict';
    error.status = 409;
    throw error;
  }
  if (row.execution_step_id) {
    await database.prepare(
      "UPDATE agentsam_execution_steps SET status = ?, error_json = ?, completed_at = CASE WHEN ? = 'denied' THEN ? ELSE completed_at END WHERE id = ? AND account_id = ? AND status = 'approval_pending'"
    ).bind(
      choice === 'approved' ? 'pending' : 'failed',
      choice === 'denied' ? JSON.stringify({ code: 'approval_denied', approval_id: approvalId, reason: response.reason }) : '{}',
      choice, now, row.execution_step_id, owner,
    ).run();
  }
  if (row.agent_run_id) {
    await appendAgentRunEvent(database, {
      runId: row.agent_run_id,
      eventType: choice === 'approved' ? 'approval.approved' : 'approval.denied',
      phase: choice === 'approved' ? 'execute' : 'waiting',
      stepId: row.execution_step_id || null,
      label: choice === 'approved' ? 'Approval granted' : 'Approval denied',
      detail: response.reason,
      evidence: { approval_id: approvalId, approval_type: row.approval_type, approved_by: decidedBy },
      dedupeKey: 'approval:' + approvalId + ':' + choice,
      createdAt: now,
    });
  }
  let spawn = null;
  const metadata = parseJson(row.metadata_json, {});
  const spawnJobId = clean(metadata.spawn_job_id);
  if (spawnJobId) {
    if (choice === 'approved') {
      const spawnJob = await database.prepare(
        'SELECT * FROM agentsam_spawn_job WHERE id = ? AND account_id = ? LIMIT 1'
      ).bind(spawnJobId, owner).first();
      if (!spawnJob) {
        const error = new Error('spawn_job_not_found:' + spawnJobId);
        error.code = 'spawn_job_not_found';
        throw error;
      }
      const spec = object(metadata.spawn);
      spawn = await spawnChildrenForJob(database, {
        spawnJob, accountId: owner, children: spec.children,
        objective: spec.objective, role: spec.role, workItemId: spec.work_item_id,
        stepId: spec.step_id, runtimeRequirements: spec.runtime_requirements,
        metadata: spec.metadata, priority: spec.priority, selectedBy: spec.selected_by,
        routingArmId: spec.routing_arm_id, reasoningEffort: spec.reasoning_effort,
        serviceTier: spec.service_tier, queueControl,
      });
    } else {
      await database.prepare(
        "UPDATE agentsam_spawn_job SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ? AND account_id = ? AND status = 'awaiting_approval'"
      ).bind(response.reason || 'Spawn approval denied', spawnJobId, owner).run();
    }
  }
  const resume = spawn ? null : await wakeRunAfterApproval(database, row, { decision: choice, queueControl });
  return {
    approval: mapApproval(await readApproval(database, approvalId, owner)),
    spawn,
    resume,
    idempotent: false,
  };
}

export async function reconcileParentAfterChildTerminal(database, {
  runId, status, errorCode = null, errorMessage = null, queueControl = null,
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
  const event = await database.prepare(
    "SELECT json_extract(evidence_json, '$.spawn_job_id') AS spawn_job_id FROM agentsam_agent_run_event WHERE run_id = ? AND event_type = 'run.created' ORDER BY seq ASC LIMIT 1"
  ).bind(childId).first();
  const spawnJobId = clean(event?.spawn_job_id);
  const parentId = child.parent_run_id;
  const now = Math.floor(Date.now() / 1000);
  if (spawnJobId) {
    const totals = await database.prepare(
      "SELECT COUNT(*) AS total, SUM(status = 'completed') AS succeeded, SUM(status IN ('failed','cancelled','partial')) AS failed, SUM(status IN ('queued','running')) AS active, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, SUM(cost_usd) AS cost_usd, SUM(COALESCE(latency_ms, 0)) AS latency_ms FROM agentsam_agent_run r WHERE r.parent_run_id = ? AND r.account_id = ? AND EXISTS (SELECT 1 FROM agentsam_agent_run_event e WHERE e.run_id = r.id AND e.event_type = 'run.created' AND json_extract(e.evidence_json, '$.spawn_job_id') = ?)"
    ).bind(parentId, child.account_id, spawnJobId).first();
    const total = Number(totals?.total || 0);
    const succeeded = Number(totals?.succeeded || 0);
    const failed = Number(totals?.failed || 0);
    const active = Number(totals?.active || 0);
    const spawnStatus = active > 0 ? 'running' : (failed > 0 && succeeded > 0 ? 'partial' : (failed > 0 ? 'failed' : 'completed'));
    await database.prepare(
      "UPDATE agentsam_spawn_job SET status = ?, subagents_spawned = ?, subagents_succeeded = ?, subagents_failed = ?, total_input_tokens = ?, total_output_tokens = ?, total_cost_usd = ?, total_latency_ms = ?, error_message = CASE WHEN ? > 0 THEN ? ELSE error_message END, completed_at = CASE WHEN ? = 0 THEN COALESCE(completed_at, datetime('now')) ELSE NULL END WHERE id = ? AND account_id = ?"
    ).bind(
      spawnStatus, total, succeeded, failed, Number(totals?.input_tokens || 0),
      Number(totals?.output_tokens || 0), Number(totals?.cost_usd || 0),
      Number(totals?.latency_ms || 0), failed,
      clean(errorMessage) || clean(errorCode) || 'One or more child runs failed',
      active, spawnJobId, child.account_id,
    ).run();
  }
  const activeChildren = await database.prepare(
    "SELECT COUNT(*) AS count FROM agentsam_agent_run WHERE parent_run_id = ? AND account_id = ? AND status IN ('queued','running')"
  ).bind(parentId, child.account_id).first();
  const pendingApprovals = await database.prepare(
    "SELECT COUNT(*) AS count FROM agentsam_approval_queue WHERE agent_run_id = ? AND account_id = ? AND status = 'pending' AND (expires_at IS NULL OR expires_at > ?)"
  ).bind(parentId, child.account_id, now).first();
  const remaining = Number(activeChildren?.count || 0);
  if (remaining > 0 || Number(pendingApprovals?.count || 0) > 0) {
    await appendAgentRunEvent(database, {
      runId: parentId, eventType: 'run.status', phase: 'recover',
      label: 'Child run finished',
      evidence: {
        child_run_id: childId, child_status: childStatus, spawn_job_id: spawnJobId || null,
        remaining_child_count: remaining, pending_approval_count: Number(pendingApprovals?.count || 0),
        error_code: clean(errorCode) || null, error_message: clean(errorMessage) || null,
      },
      dedupeKey: 'child-terminal:' + childId + ':' + childStatus,
      createdAt: now,
    });
    return { reconciled: true, parent_run_id: parentId, woke_parent: false, remaining_child_count: remaining, spawn_job_id: spawnJobId || null };
  }
  const parent = await database.prepare(
    'SELECT * FROM agentsam_agent_run WHERE id = ? AND account_id = ? LIMIT 1'
  ).bind(parentId, child.account_id).first();
  if (!parent || ['completed', 'failed', 'cancelled'].includes(parent.status)) {
    return { reconciled: true, parent_run_id: parentId, woke_parent: false, reason: 'parent_terminal' };
  }
  await database.prepare(
    "UPDATE agentsam_agent_run SET status = 'queued', updated_at_unix = ? WHERE id = ? AND account_id = ? AND status IN ('running','queued')"
  ).bind(now, parentId, child.account_id).run();
  await appendAgentRunEvent(database, {
    runId: parentId, eventType: 'run.woken', phase: 'recover',
    label: 'Child work completed',
    evidence: {
      completed_child_run_id: childId, completed_child_status: childStatus,
      spawn_job_id: spawnJobId || null, cancel_requested: Boolean(parent.cancel_requested),
    },
    dedupeKey: 'wake-child:' + childId,
    createdAt: now,
  });
  const queue = queueControl || createLocalQueueControl(database);
  const queued = await queue.enqueue(
    {
      kind: 'agent.resume',
      account_id: child.account_id,
      payload: {
        run_id: parentId, wake_reason: 'child_run',
        completed_child_run_id: childId, completed_child_status: childStatus,
        spawn_job_id: spawnJobId || null, cancel_requested: Boolean(parent.cancel_requested),
      },
    },
    {
      id: 'job_agent_resume_' + parentId + '_' + childId,
      account_id: child.account_id,
      source_run_id: parentId,
      idempotency_key: 'agent-resume:' + parentId + ':after:' + childId,
      priority: parent.cancel_requested ? 'high' : 'normal',
    },
  );
  return {
    reconciled: true, parent_run_id: parentId, woke_parent: true,
    spawn_job_id: spawnJobId || null, resume_job: queued.job,
    queue: queued.plan?.physical_queue || null,
  };
}

