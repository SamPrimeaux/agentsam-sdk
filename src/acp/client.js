import { randomUUID } from 'node:crypto';
import { createLocalSqliteDatabase } from '../local/sqlite.js';
import { applyRuntimeMigrations } from '../local/migrations.js';
import { runtimeDatabasePath } from '../local/runtime-store.js';
import { spawnChildRun } from './dependencies.js';
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
         s.state AS suspension_state, s.reason AS suspension_reason,
         s.wake_at_unix, s.wake_event, s.dependency_run_ids_json,
         s.resume_step_id, s.checkpoint_ref, s.expires_at_unix,
         s.attempt AS suspension_attempt, s.metadata_json AS suspension_metadata_json
  FROM agentsam_agent_run r
  LEFT JOIN agentsam_agent_run_suspension s ON s.run_id = r.id
`;

function mapSuspension(row) {
  if (!row?.suspension_state) return null;
  return {
    runId: row.id, state: row.suspension_state, reason: row.suspension_reason,
    wakeAt: row.wake_at_unix ?? undefined, wakeEvent: row.wake_event ?? undefined,
    dependencyRunIds: parseJson(row.dependency_run_ids_json, []),
    resumeStepId: row.resume_step_id ?? undefined,
    checkpointRef: row.checkpoint_ref ?? undefined,
    expiresAt: row.expires_at_unix ?? undefined,
    attempt: Number(row.suspension_attempt || 0),
    metadata: parseJson(row.suspension_metadata_json, {}),
  };
}

function mapRun(row) {
  if (!row) return null;
  const suspension = mapSuspension(row);
  return {
    schema: 'agentsam.run.v1', id: row.id, accountId: row.account_id ?? undefined,
    conversationId: row.conversation_id ?? undefined, parentRunId: row.parent_run_id ?? undefined,
    externalAgentId: row.external_agent_id ?? undefined, externalRunId: row.external_run_id ?? undefined,
    sourceClient: row.source_client ?? undefined, surface: row.surface ?? undefined, mode: row.mode ?? undefined,
    modelKey: row.model_key ?? undefined, reasoningEffort: row.reasoning_effort ?? undefined,
    requestedServiceTier: row.requested_service_tier ?? undefined, actualServiceTier: row.actual_service_tier ?? undefined,
    selectedBy: row.selected_by ?? undefined, status: suspension?.state || row.status, storageStatus: row.status,
    cancelRequested: Boolean(row.cancel_requested), errorCode: row.error_code ?? undefined, errorMessage: row.error_message ?? undefined,
    modelCallCount: Number(row.model_call_count || 0), toolCallCount: Number(row.tool_call_count || 0),
    inputTokens: Number(row.input_tokens || 0), cachedInputTokens: Number(row.cached_input_tokens || 0),
    outputTokens: Number(row.output_tokens || 0), reasoningTokens: Number(row.reasoning_tokens || 0),
    costUsd: Number(row.cost_usd || 0), planId: row.plan_id ?? undefined, todoId: row.todo_id ?? undefined,
    createdAt: row.created_at_unix == null ? undefined : Number(row.created_at_unix) * 1000,
    startedAt: row.started_at_unix == null ? undefined : Number(row.started_at_unix) * 1000,
    completedAt: row.completed_at_unix == null ? undefined : Number(row.completed_at_unix) * 1000,
    updatedAt: row.updated_at_unix == null ? undefined : Number(row.updated_at_unix) * 1000,
    latencyMs: row.latency_ms == null ? undefined : Number(row.latency_ms), suspension,
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

async function withLocalDb(cwd, fn) {
  const db = await createLocalSqliteDatabase(runtimeDatabasePath(cwd));
  try { await applyRuntimeMigrations(db); return await fn(db); } finally { db.close(); }
}

export class DatabaseAgentControlClient {
  constructor({ database, kind = 'database' } = {}) {
    if (!database || typeof database.prepare !== 'function') {
      throw new TypeError('database with prepare() is required');
    }
    this.database = database;
    this.kind = clean(kind) || 'database';
  }

  async getRun(id) {
    return mapRun(await this.database.prepare(RUN_JOIN + ' WHERE r.id = ? LIMIT 1').bind(id).first());
  }

  async start(input = {}) {
    return createRootRun(this.database, {
      runId: input.run_id ?? input.runId ?? null,
      accountId: input.account_id ?? input.accountId ?? null,
      conversationId: input.conversation_id ?? input.conversationId ?? null,
      objective: input.objective ?? '',
      role: input.role ?? 'lead',
      mode: input.mode ?? 'agent',
      modelKey: input.model_key ?? input.modelKey ?? null,
      reasoningEffort: input.reasoning_effort ?? input.reasoningEffort ?? null,
      serviceTier: input.service_tier ?? input.serviceTier ?? null,
      runtimeRequirements: input.runtime_requirements ?? input.runtimeRequirements ?? {},
      metadata: input.metadata ?? {},
      priority: input.priority ?? 'normal',
      sourceClient: input.source_client ?? input.sourceClient ?? 'agentsam-acp',
      surface: input.surface ?? 'control-plane',
    });
  }

  async events(id, { after = -1, limit = 200 } = {}) {
    const result = await this.database.prepare(`
      SELECT * FROM agentsam_agent_run_event
      WHERE run_id = ? AND seq > ?
      ORDER BY seq ASC LIMIT ?
    `).bind(id, Math.max(-1, Number(after)), Math.max(1, Math.min(1000, Number(limit)))).all();
    return (result.results || []).map(mapEvent);
  }

  async tree(id) {
    const result = await this.database.prepare(`
      WITH RECURSIVE descendants(id, depth, path) AS (
        SELECT id, 0, ',' || id || ',' FROM agentsam_agent_run WHERE id = ?
        UNION ALL
        SELECT child.id, descendants.depth + 1, descendants.path || child.id || ','
        FROM agentsam_agent_run child
        JOIN descendants ON child.parent_run_id = descendants.id
        WHERE descendants.depth < 64
          AND instr(descendants.path, ',' || child.id || ',') = 0
      )
      SELECT r.*, descendants.depth,
             s.state AS suspension_state, s.reason AS suspension_reason,
             s.wake_at_unix, s.wake_event, s.dependency_run_ids_json,
             s.resume_step_id, s.checkpoint_ref, s.expires_at_unix,
             s.attempt AS suspension_attempt, s.metadata_json AS suspension_metadata_json
      FROM descendants
      JOIN agentsam_agent_run r ON r.id = descendants.id
      LEFT JOIN agentsam_agent_run_suspension s ON s.run_id = r.id
      ORDER BY descendants.depth, r.created_at_unix, r.id
    `).bind(id).all();
    const rows = result.results || [];
    if (!rows.length) return null;
    const byId = new Map(rows.map((row) => [
      row.id,
      { ...mapRun(row), depth: Number(row.depth || 0), children: [] },
    ]));
    for (const node of byId.values()) {
      if (node.parentRunId && byId.has(node.parentRunId)) {
        byId.get(node.parentRunId).children.push(node);
      }
    }
    return byId.get(id) || null;
  }

  async spawn(id, input = {}) {
    return spawnChildRun(this.database, {
      parentRunId: id,
      childRunId: input.child_run_id ?? input.childRunId ?? null,
      accountId: input.account_id ?? input.accountId ?? null,
      objective: input.objective ?? '',
      role: input.role ?? input.role_slug ?? null,
      workItemId: input.work_item_id ?? input.workItemId ?? null,
      stepId: input.step_id ?? input.stepId ?? null,
      modelKey: input.model_key ?? input.modelKey ?? null,
      reasoningEffort: input.reasoning_effort ?? input.reasoningEffort ?? null,
      serviceTier: input.service_tier ?? input.serviceTier ?? null,
      runtimeRequirements: input.runtime_requirements ?? input.runtimeRequirements ?? {},
      metadata: input.metadata ?? {},
      priority: input.priority ?? 'normal',
    });
  }

  async cancel(id) {
    const row = await this.database.prepare(RUN_JOIN + ' WHERE r.id = ? LIMIT 1').bind(id).first();
    if (!row) return null;
    const run = mapRun(row);
    if (isTerminal(run.status)) return { ...run, cancelAccepted: false };

    await this.database.prepare(
      'UPDATE agentsam_agent_run SET cancel_requested=1, updated_at_unix=unixepoch() WHERE id=?'
    ).bind(id).run();
    const seqRow = await this.database.prepare(
      'SELECT COALESCE(MAX(seq), -1) + 1 AS next_seq FROM agentsam_agent_run_event WHERE run_id=?'
    ).bind(id).first();
    await this.database.prepare(`
      INSERT OR IGNORE INTO agentsam_agent_run_event (
        event_id, run_id, parent_run_id, seq, event_type, phase, label,
        source_kind, evidence_json, dedupe_key
      ) VALUES (?, ?, ?, ?, 'run.cancel_requested', 'recover', ?, 'sam', ?, ?)
    `).bind(
      `evt_${randomUUID()}`,
      id,
      row.parent_run_id || null,
      Number(seqRow?.next_seq || 0),
      'Cancellation requested',
      JSON.stringify({ requested_by: 'user' }),
      `cancel:${id}`,
    ).run();

    return { ...(await this.getRun(id)), cancelAccepted: true };
  }

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
      planId: run.planId ?? null,
      todoId: run.todoId ?? null,
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
      suspension: run.suspension,
      eventCount: events.length,
      childRunCount: tree?.children?.length || 0,
      lastEvent,
    };
  }
}

export class LocalAgentControlClient {
  constructor({ cwd = process.cwd() } = {}) {
    this.cwd = cwd;
    this.kind = 'local';
  }

  async #withClient(fn) {
    return withLocalDb(this.cwd, (database) =>
      fn(new DatabaseAgentControlClient({ database, kind: this.kind })));
  }

  getRun(id) { return this.#withClient((client) => client.getRun(id)); }
  start(input = {}) { return this.#withClient((client) => client.start(input)); }
  events(id, options = {}) { return this.#withClient((client) => client.events(id, options)); }
  tree(id) { return this.#withClient((client) => client.tree(id)); }
  spawn(id, input = {}) { return this.#withClient((client) => client.spawn(id, input)); }
  cancel(id) { return this.#withClient((client) => client.cancel(id)); }
  receipt(id) { return this.#withClient((client) => client.receipt(id)); }
}

export class HttpAgentControlClient {
  constructor({ baseUrl, token = '', fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = clean(baseUrl).replace(/\/+$/, '');
    if (!this.baseUrl) throw new TypeError('Agent Control Plane base URL is required');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
    this.token = clean(token); this.fetchImpl = fetchImpl; this.kind = 'http';
  }
  async request(path, init = {}) {
    const headers = new Headers(init.headers || {});
    headers.set('accept', 'application/json');
    if (init.body != null) headers.set('content-type', 'application/json');
    if (this.token) headers.set('authorization', `Bearer ${this.token}`);
    const response = await this.fetchImpl(this.baseUrl + path, { ...init, headers });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error(body?.error?.message || body?.message || `acp_http_${response.status}`);
      error.code = body?.error?.code || `acp_http_${response.status}`; error.status = response.status; throw error;
    }
    return body;
  }
  start(input = {}) {
    return this.request('/v1/runs', { method: 'POST', body: JSON.stringify(input) });
  }
  getRun(id) { return this.request(`/v1/runs/${encodeURIComponent(id)}`); }
  events(id, { after = -1, limit = 200 } = {}) {
    return this.request(`/v1/runs/${encodeURIComponent(id)}/events?after=${encodeURIComponent(after)}&limit=${encodeURIComponent(limit)}`);
  }
  tree(id) { return this.request(`/v1/runs/${encodeURIComponent(id)}/tree`); }
  spawn(id, input = {}) {
    return this.request(`/v1/runs/${encodeURIComponent(id)}/spawn`, { method: 'POST', body: JSON.stringify(input) });
  }
  cancel(id) { return this.request(`/v1/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' }); }
  receipt(id) { return this.request(`/v1/runs/${encodeURIComponent(id)}/receipt`); }
}

export function createAgentControlClient({
  cwd = process.cwd(),
  url = process.env.AGENTSAM_CONTROL_PLANE_URL || '',
  token = process.env.AGENTSAM_CONTROL_PLANE_TOKEN || '',
  local = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  return clean(url) && !local
    ? new HttpAgentControlClient({ baseUrl: url, token, fetchImpl })
    : new LocalAgentControlClient({ cwd });
}
