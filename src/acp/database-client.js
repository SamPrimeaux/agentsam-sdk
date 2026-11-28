import { appendAgentRunEvent, recordAgentRunTimeout, spawnChildRun, requestAgentApproval, getAgentApproval, listAgentApprovals, decideAgentApproval } from './dependencies.js';
import { createRootRun } from './runs.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
function isTerminal(status) {
  return ['completed', 'failed', 'cancelled', 'timed_out'].includes(status);
}

const RUN_JOIN = `
  SELECT r.*,
         (SELECT e.event_type FROM agentsam_agent_run_event e
           WHERE e.run_id = r.id AND e.event_type = 'run.timed_out'
           ORDER BY e.seq DESC LIMIT 1) AS terminal_event_type,
         (SELECT COUNT(*) FROM agentsam_agent_run child
           WHERE child.parent_run_id = r.id AND child.status IN ('queued','running')) AS active_child_count,
         (SELECT COUNT(*) FROM agentsam_approval_queue approval
           WHERE approval.agent_run_id = r.id AND approval.account_id = r.account_id
             AND approval.status = 'pending'
             AND (approval.expires_at IS NULL OR approval.expires_at > unixepoch())) AS pending_approval_count
  FROM agentsam_agent_run r
`;

/** @returns {import('@inneranimalmedia/agentsam-contracts').AgentRunV1 | null} */
function mapRun(row) {
  if (!row) return null;
  const status = row.terminal_event_type === 'run.timed_out' ? 'timed_out'
    : Number(row.pending_approval_count || 0) > 0 ? 'awaiting_approval'
      : Number(row.active_child_count || 0) > 0 ? 'waiting_child' : row.status;
  return {
    schema: 'agentsam.run.v1', id: row.id, accountId: row.account_id ?? undefined,
    conversationId: row.conversation_id ?? undefined, parentRunId: row.parent_run_id ?? undefined,
    externalAgentId: row.external_agent_id ?? undefined, externalRunId: row.external_run_id ?? undefined,
    sourceClient: row.source_client ?? undefined, surface: row.surface ?? undefined, mode: row.mode ?? undefined,
    modelKey: row.model_key ?? undefined, reasoningEffort: row.reasoning_effort ?? undefined,
    requestedServiceTier: row.requested_service_tier ?? undefined, actualServiceTier: row.actual_service_tier ?? undefined,
    selectedBy: row.selected_by === 'thompson' ? 'automatic' : (row.selected_by ?? undefined),
    status, storageStatus: row.status,
    cancelRequested: Boolean(row.cancel_requested), errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    modelCallCount: Number(row.model_call_count || 0), toolCallCount: Number(row.tool_call_count || 0),
    inputTokens: Number(row.input_tokens || 0), cachedInputTokens: Number(row.cached_input_tokens || 0),
    outputTokens: Number(row.output_tokens || 0), reasoningTokens: Number(row.reasoning_tokens || 0),
    costUsd: Number(row.cost_usd || 0),
    createdAt: row.created_at_unix == null ? undefined : Number(row.created_at_unix) * 1000,
    startedAt: row.started_at_unix == null ? undefined : Number(row.started_at_unix) * 1000,
    completedAt: row.completed_at_unix == null ? undefined : Number(row.completed_at_unix) * 1000,
    updatedAt: row.updated_at_unix == null ? undefined : Number(row.updated_at_unix) * 1000,
    latencyMs: row.latency_ms == null ? undefined : Number(row.latency_ms),
  };
}

function mapEvent(row) {
  if (!row) return null;
  const progress = row.progress_current == null && row.progress_total == null ? null : {
    current: Number(row.progress_current || 0), total: Number(row.progress_total || 0),
  };
  return {
    id: row.event_id, runId: row.run_id, parentRunId: row.parent_run_id ?? undefined, seq: Number(row.seq),
    eventType: row.event_type, phase: row.phase ?? undefined, stepId: row.step_id ?? undefined,
    label: row.label || '', detail: row.detail ?? null, progress,
    source: row.source_kind || row.source_name ? { kind: row.source_kind || 'sam', name: row.source_name ?? null } : null,
    evidence: parseJson(row.evidence_json, {}), createdAt: Number(row.created_at_unix) * 1000,
  };
}

async function readRunRow(database, accountId, id) {
  const owner = clean(accountId);
  const query = database.prepare(
    RUN_JOIN + (owner ? ' WHERE r.id = ? AND r.account_id = ? LIMIT 1' : ' WHERE r.id = ? LIMIT 1')
  );
  return owner ? query.bind(id, owner).first() : query.bind(id).first();
}

export class DatabaseAgentControlClient {
  constructor({
    database,
    kind = 'database',
    accountId = null,
    actorId = null,
    queueControl = null,
    onTimeout = null,
    requireAccount = false,
  } = {}) {
    if (!database || typeof database.prepare !== 'function') {
      throw new TypeError('database with prepare() is required');
    }
    this.database = database;
    this.kind = clean(kind) || 'database';
    this.accountId = clean(accountId) || null;
    this.actorId = clean(actorId) || this.accountId;
    this.queueControl = queueControl;
    this.onTimeout = typeof onTimeout === 'function' ? onTimeout : null;
    this.requireAccount = Boolean(requireAccount);
  }

  async getRun(id) {
    return mapRun(await readRunRow(this.database, this.accountId, id));
  }

  async start(input = {}) {
    const accountId = this.accountId || clean(input.account_id ?? input.accountId) || null;
    if (this.requireAccount && !accountId) {
      const error = new Error('authenticated_account_required');
      error.code = 'authenticated_account_required';
      error.status = 401;
      throw error;
    }
    return createRootRun(this.database, {
      runId: input.run_id ?? input.runId ?? null,
      accountId,
      conversationId: input.conversation_id ?? input.conversationId ?? null,
      objective: input.objective ?? '',
      role: input.role ?? 'lead',
      mode: input.mode ?? 'agent',
      modelKey: input.model_key ?? input.modelKey ?? null,
      selectedBy: input.selected_by ?? input.selectedBy ?? null,
      routingArmId: input.routing_arm_id ?? input.routingArmId ?? null,
      reasoningEffort: input.reasoning_effort ?? input.reasoningEffort ?? null,
      serviceTier: input.service_tier ?? input.serviceTier ?? null,
      runtimeRequirements: input.runtime_requirements ?? input.runtimeRequirements ?? {},
      metadata: input.metadata ?? {},
      priority: input.priority ?? 'normal',
      sourceClient: input.source_client ?? input.sourceClient ?? 'agentsam-acp',
      surface: input.surface ?? 'control-plane',
      queueControl: this.queueControl,
    });
  }

  async events(id, { after = -1, limit = 200 } = {}) {
    const accountClause = this.accountId ? ' AND r.account_id = ?' : '';
    const params = this.accountId
      ? [id, this.accountId, Math.max(-1, Number(after)), Math.max(1, Math.min(1000, Number(limit)))]
      : [id, Math.max(-1, Number(after)), Math.max(1, Math.min(1000, Number(limit)))];
    const result = await this.database.prepare(`
      SELECT e.*
      FROM agentsam_agent_run_event e
      JOIN agentsam_agent_run r ON r.id = e.run_id
      WHERE e.run_id = ?${accountClause} AND e.seq > ?
      ORDER BY e.seq ASC LIMIT ?
    `).bind(...params).all();
    return (result.results || []).map(mapEvent);
  }

  async tree(id) {
    const rootFilter = this.accountId ? 'id = ? AND account_id = ?' : 'id = ?';
    const childAccountClause = this.accountId ? ' AND child.account_id = ?' : '';
    const rootParams = this.accountId ? [id, this.accountId, this.accountId] : [id];
    const result = await this.database.prepare(
      'WITH RECURSIVE descendants(id, depth, path) AS (' +
      " SELECT id, 0, ',' || id || ',' FROM agentsam_agent_run WHERE " + rootFilter +
      " UNION ALL SELECT child.id, descendants.depth + 1, descendants.path || child.id || ','" +
      ' FROM agentsam_agent_run child JOIN descendants ON child.parent_run_id = descendants.id' +
      ' WHERE descendants.depth < 64 AND instr(descendants.path, "," || child.id || ",") = 0' + childAccountClause +
      ') SELECT r.*, descendants.depth,' +
      " (SELECT e.event_type FROM agentsam_agent_run_event e WHERE e.run_id = r.id AND e.event_type = 'run.timed_out' ORDER BY e.seq DESC LIMIT 1) AS terminal_event_type," +
      " (SELECT COUNT(*) FROM agentsam_agent_run child WHERE child.parent_run_id = r.id AND child.status IN ('queued','running')) AS active_child_count," +
      " (SELECT COUNT(*) FROM agentsam_approval_queue approval WHERE approval.agent_run_id = r.id AND approval.account_id = r.account_id AND approval.status = 'pending' AND (approval.expires_at IS NULL OR approval.expires_at > unixepoch())) AS pending_approval_count" +
      ' FROM descendants JOIN agentsam_agent_run r ON r.id = descendants.id' +
      ' ORDER BY descendants.depth, r.created_at_unix, r.id'
    ).bind(...rootParams).all();
    const rows = result.results || [];
    if (!rows.length) return null;
    const byId = new Map(rows.map((row) => [row.id, { ...mapRun(row), depth: Number(row.depth || 0), children: [] }]));
    for (const node of byId.values()) {
      if (node.parentRunId && byId.has(node.parentRunId)) byId.get(node.parentRunId).children.push(node);
    }
    return byId.get(id) || null;
  }

  async spawn(id, input = {}) {
    return spawnChildRun(this.database, {
      parentRunId: id,
      childRunId: input.child_run_id ?? input.childRunId ?? null,
      spawnJobId: input.spawn_job_id ?? input.spawnJobId ?? null,
      accountId: this.accountId || input.account_id || input.accountId || null,
      initiatedByType: input.initiated_by_type ?? input.initiatedByType ?? 'user',
      initiatedById: this.actorId || input.initiated_by_id || input.initiatedById || this.accountId,
      objective: input.objective ?? '',
      role: input.role ?? input.role_slug ?? null,
      children: input.children ?? [],
      workItemId: input.work_item_id ?? input.workItemId ?? null,
      stepId: input.step_id ?? input.stepId ?? null,
      modelKey: input.model_key ?? input.modelKey ?? null,
      selectedBy: input.selected_by ?? input.selectedBy ?? null,
      routingArmId: input.routing_arm_id ?? input.routingArmId ?? null,
      reasoningEffort: input.reasoning_effort ?? input.reasoningEffort ?? null,
      serviceTier: input.service_tier ?? input.serviceTier ?? null,
      runtimeRequirements: input.runtime_requirements ?? input.runtimeRequirements ?? {},
      metadata: input.metadata ?? {},
      priority: input.priority ?? 'normal',
      chunkingStrategy: input.chunking_strategy ?? input.chunkingStrategy ?? 'manual',
      mergeStrategy: input.merge_strategy ?? input.mergeStrategy ?? 'concat',
      mergeInstructions: input.merge_instructions ?? input.mergeInstructions ?? null,
      costCapUsd: input.cost_cap_usd ?? input.costCapUsd ?? null,
      requiresApproval: input.requires_approval ?? input.requiresApproval ?? false,
      approvalExpiresAt: input.approval_expires_at ?? input.approvalExpiresAt ?? null,
      queueControl: this.queueControl,
    });
  }

  async requestApproval(input = {}) {
    const accountId = this.accountId || clean(input.account_id ?? input.accountId) || null;
    if (this.requireAccount && !accountId) {
      const error = new Error('authenticated_account_required');
      error.code = 'authenticated_account_required';
      error.status = 401;
      throw error;
    }
    return requestAgentApproval(this.database, { ...input, account_id: accountId });
  }

  async getApproval(id) {
    return getAgentApproval(this.database, id, this.accountId);
  }

  async listApprovals(options = {}) {
    return listAgentApprovals(this.database, {
      accountId: this.accountId || options.account_id || options.accountId,
      runId: options.run_id || options.runId || null,
      status: options.status || 'pending',
      limit: options.limit || 100,
    });
  }

  async decideApproval(id, input = {}) {
    return decideAgentApproval(this.database, {
      id,
      accountId: this.accountId || input.account_id || input.accountId,
      actorId: this.actorId,
      decision: input.decision,
      reason: input.reason || '',
      queueControl: this.queueControl,
    });
  }

  async cancel(id) {
    const row = await readRunRow(this.database, this.accountId, id);
    if (!row) return null;
    const run = mapRun(row);
    if (isTerminal(run.status)) return { ...run, cancelAccepted: false };

    const update = this.accountId
      ? this.database.prepare('UPDATE agentsam_agent_run SET cancel_requested=1, updated_at_unix=unixepoch() WHERE id=? AND account_id=?').bind(id, this.accountId)
      : this.database.prepare('UPDATE agentsam_agent_run SET cancel_requested=1, updated_at_unix=unixepoch() WHERE id=?').bind(id);
    await update.run();
    await appendAgentRunEvent(this.database, {
      runId: id,
      parentRunId: row.parent_run_id || null,
      eventType: 'run.cancel_requested',
      phase: 'recover',
      label: 'Cancellation requested',
      sourceKind: 'sam',
      evidence: { requested_by: 'user' },
      dedupeKey: `cancel:${id}`,
    });

    return { ...(await this.getRun(id)), cancelAccepted: true };
  }

  async timeout(id, input = {}) {
    const row = await readRunRow(this.database, this.accountId, id);
    if (!row) return null;
    const errorCode = clean(input.error_code ?? input.errorCode) || 'run_timeout';
    const errorMessage = clean(input.error_message ?? input.errorMessage) || 'Agent run timed out';
    const createdAt = Number.isFinite(Number(input.created_at_unix ?? input.createdAt))
      ? Math.trunc(Number(input.created_at_unix ?? input.createdAt))
      : Math.floor(Date.now() / 1000);
    const result = await recordAgentRunTimeout(this.database, {
      runId: id,
      accountId: this.accountId,
      errorCode,
      errorMessage,
      createdAt,
    });
    const updatedRow = await readRunRow(this.database, this.accountId, id);
    if (!updatedRow) return null;

    let analytics = null;
    if (this.onTimeout && result.status === 'timed_out') {
      try {
        analytics = await this.onTimeout({
          run: updatedRow,
          event: result.event,
          errorCode,
          createdAt,
          result,
        });
      } catch (error) {
        analytics = { ok: false, error: String(error?.message || error).slice(0, 240) };
      }
    }

    return {
      ...mapRun(updatedRow),
      timeoutRecorded: Boolean(result.recorded),
      timeout: result,
      analytics,
    };
  }

  /** @returns {Promise<import('@inneranimalmedia/agentsam-contracts').AgentRunReceiptV1 | null>} */
  async receipt(id) {
    const run = await this.getRun(id);
    if (!run) return null;
    const [events, tree] = await Promise.all([
      this.events(id, { limit: 1000 }),
      this.tree(id),
    ]);
    const lastEvent = events.length ? events[events.length - 1] : null;
    return {
      schema: 'agentsam.run-receipt.v1',
      runId: id,
      status: run.status,
      terminal: isTerminal(run.status),
      parentRunId: run.parentRunId ?? null,
      usage: {
        modelCalls: run.modelCallCount,
        toolCalls: run.toolCallCount,
        inputTokens: run.inputTokens,
        cachedInputTokens: run.cachedInputTokens,
        outputTokens: run.outputTokens,
        reasoningTokens: run.reasoningTokens,
        costUsd: run.costUsd,
      },
      timing: {
        createdAt: run.createdAt ?? null,
        startedAt: run.startedAt ?? null,
        completedAt: run.completedAt ?? null,
        latencyMs: run.latencyMs ?? null,
      },
      error: run.errorCode || run.errorMessage
        ? { code: run.errorCode ?? null, message: run.errorMessage ?? null }
        : null,
      eventCount: events.length,
      childRunCount: tree?.children?.length || 0,
      lastEvent,
    }
  }
}

