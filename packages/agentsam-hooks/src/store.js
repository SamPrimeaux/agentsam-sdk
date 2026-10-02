import { matchesHookInput, normalizeHookEvent } from './contracts.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function json(value, fallback) {
  if (value && typeof value === 'object') return structuredClone(value);
  try { return JSON.parse(String(value || '')); } catch { return structuredClone(fallback); }
}
function jsonText(value, fallback) { return JSON.stringify(value == null ? fallback : value); }
function id(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${uuid.replaceAll('-', '').slice(0, 24)}`;
}
async function rows(statement) {
  const result = await statement.all();
  return Array.isArray(result) ? result : result?.results || [];
}

function normalizeStoredHook(row = {}) {
  return Object.freeze({
    id: clean(row.id),
    owner_id: clean(row.owner_id) || 'local',
    hook_key: clean(row.hook_key),
    event_type: normalizeHookEvent(row.event_type),
    source_kind: clean(row.source_kind) || 'stored',
    scope_type: clean(row.scope_type) || 'project',
    scope_ref: clean(row.scope_ref) || null,
    handler_type: clean(row.handler_type) || 'log_only',
    handler_config: json(row.handler_config_json ?? row.handler_config, {}),
    match: json(row.match_json ?? row.match, {}),
    failure_mode: clean(row.failure_mode) || 'open',
    priority: Number(row.priority ?? 100),
    timeout_ms: Number(row.timeout_ms ?? 30_000),
    is_active: row.is_active == null ? true : Boolean(Number(row.is_active)),
    workflow_id: clean(row.workflow_id) || null,
    description: clean(row.description) || null,
    metadata: json(row.metadata_json ?? row.metadata, {}),
    revision: Number(row.revision ?? 1),
    created_at_unix: Number(row.created_at_unix || 0) || null,
    updated_at_unix: Number(row.updated_at_unix || 0) || null,
  });
}

function scopeMatches(hook, context = {}) {
  if (!hook.scope_ref || hook.scope_type === 'global') return true;
  const expected = hook.scope_ref;
  if (hook.scope_type === 'account') return expected === clean(context.owner_id || context.account_id);
  if (hook.scope_type === 'repository') return expected === clean(context.repository_id);
  if (hook.scope_type === 'project') return [context.project_id, context.project_root].map(clean).includes(expected);
  if (hook.scope_type === 'session') return expected === clean(context.session_id);
  return false;
}

/**
 * Storage-agnostic hook definition and receipt store. `db` may be Cloudflare
 * D1 or AgentSam's injected SQLite adapter; schema installation stays an
 * explicit schema-pack/migration concern.
 */
export function createHookStore(db, options = {}) {
  if (!db?.prepare) throw new TypeError('hook_store_database_required');
  const ownerId = clean(options.ownerId) || 'local';

  async function listHooks(query = {}) {
    const requestedOwner = clean(query.owner_id) || ownerId;
    const clauses = ['owner_id = ?'];
    const values = [requestedOwner];
    if (query.event_type) { clauses.push('event_type = ?'); values.push(normalizeHookEvent(query.event_type)); }
    if (query.activeOnly !== false) clauses.push('is_active = 1');
    const found = await rows(db.prepare(`
      SELECT * FROM agentsam_hook
      WHERE ${clauses.join(' AND ')}
      ORDER BY event_type, priority, hook_key
    `).bind(...values));
    const normalized = found.map(normalizeStoredHook);
    return Object.freeze(query.context ? normalized.filter((row) => scopeMatches(row, query.context)) : normalized);
  }

  async function getHook(hookId) {
    const row = await db.prepare('SELECT * FROM agentsam_hook WHERE owner_id = ? AND (id = ? OR hook_key = ?) LIMIT 1')
      .bind(ownerId, clean(hookId), clean(hookId)).first();
    return row ? normalizeStoredHook(row) : null;
  }

  async function upsertHook(value = {}) {
    const hookKey = clean(value.hook_key || value.hookKey || value.id);
    if (!hookKey) throw new TypeError('hook_key_required');
    const eventType = normalizeHookEvent(value.event_type || value.eventType || value.hook);
    const scopeType = clean(value.scope_type || value.scopeType) || 'project';
    const scopeRef = clean(value.scope_ref || value.scopeRef) || null;
    const existing = await db.prepare(`
      SELECT id, revision FROM agentsam_hook
      WHERE owner_id = ? AND scope_type = ? AND IFNULL(scope_ref, '') = IFNULL(?, '') AND hook_key = ?
      LIMIT 1
    `).bind(ownerId, scopeType, scopeRef, hookKey).first();
    const hookId = clean(value.id) || clean(existing?.id) || id('hook');
    const sourceKind = clean(value.source_kind || value.sourceKind) || 'stored';
    const handlerType = clean(value.handler_type || value.handlerType) || 'log_only';
    const failureMode = clean(value.failure_mode || value.failureMode) || 'open';
    const priority = Number(value.priority ?? 100);
    const timeoutMs = Number(value.timeout_ms ?? value.timeoutMs ?? 30_000);
    const active = value.is_active ?? value.enabled ?? true;
    const handlerConfig = value.handler_config ?? value.handlerConfig ?? {};
    const match = value.match ?? value.match_json ?? {};
    const metadata = value.metadata ?? {};
    const workflowId = clean(value.workflow_id || value.workflowId) || null;
    const description = clean(value.description) || null;

    if (existing) {
      await db.prepare(`
        UPDATE agentsam_hook SET
          event_type = ?, source_kind = ?, handler_type = ?, handler_config_json = ?, match_json = ?,
          failure_mode = ?, priority = ?, timeout_ms = ?, is_active = ?, workflow_id = ?, description = ?,
          metadata_json = ?, revision = revision + 1, updated_at_unix = unixepoch()
        WHERE id = ? AND owner_id = ?
      `).bind(eventType, sourceKind, handlerType, jsonText(handlerConfig, {}), jsonText(match, {}), failureMode,
        priority, timeoutMs, active ? 1 : 0, workflowId, description, jsonText(metadata, {}), existing.id, ownerId).run();
    } else {
      await db.prepare(`
        INSERT INTO agentsam_hook (
          id, owner_id, hook_key, event_type, source_kind, scope_type, scope_ref,
          handler_type, handler_config_json, match_json, failure_mode, priority,
          timeout_ms, is_active, workflow_id, description, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(hookId, ownerId, hookKey, eventType, sourceKind, scopeType, scopeRef,
        handlerType, jsonText(handlerConfig, {}), jsonText(match, {}), failureMode, priority,
        timeoutMs, active ? 1 : 0, workflowId, description, jsonText(metadata, {})).run();
    }
    return getHook(hookId);
  }

  async function setHookActive(hookId, active) {
    const result = await db.prepare(`
      UPDATE agentsam_hook SET is_active = ?, revision = revision + 1, updated_at_unix = unixepoch()
      WHERE owner_id = ? AND (id = ? OR hook_key = ?)
    `).bind(active ? 1 : 0, ownerId, clean(hookId), clean(hookId)).run();
    return Number(result?.changes || result?.meta?.changes || 0) > 0;
  }

  async function removeHook(hookId) {
    const result = await db.prepare('DELETE FROM agentsam_hook WHERE owner_id = ? AND (id = ? OR hook_key = ?)')
      .bind(ownerId, clean(hookId), clean(hookId)).run();
    return Number(result?.changes || result?.meta?.changes || 0) > 0;
  }

  async function recordExecution(receipt = {}, correlation = {}) {
    const invocation = receipt.invocation || {};
    const safeInvocation = Object.fromEntries(
      ['session_id', 'run_id', 'turn_id', 'message_id', 'agent_id', 'parent_agent_id', 'source']
        .map((key) => [key, clean(invocation[key])])
        .filter(([, value]) => value),
    );
    const safeCorrelation = Object.fromEntries(
      ['trace_id', 'request_id', 'workflow_id', 'plan_id', 'todo_id', 'project_id', 'repository_id', 'parent_execution_id']
        .map((key) => [key, clean(correlation.context?.[key])])
        .filter(([, value]) => value),
    );
    const hookKey = clean(receipt.hook_id || correlation.hook_key);
    if (!hookKey) throw new TypeError('hook_receipt_hook_id_required');
    const error = receipt.error || {};
    const sourceKind = clean(correlation.source_kind || invocation.metadata?.hook_source) || 'config';
    const status = receipt.status === 'completed' ? 'completed'
      : error.code === 'AGENTSAM_HOOK_TIMEOUT' ? 'timeout' : 'failed';
    const ranAt = Number(receipt.completed_at || receipt.started_at || Date.now());
    const ranAtUnix = ranAt > 10_000_000_000 ? Math.floor(ranAt / 1000) : Math.floor(ranAt);
    const executionId = clean(correlation.id) || id('hexec');
    const safeReceipt = {
      schema: receipt.schema,
      hook_id: hookKey,
      hook: receipt.hook,
      invocation: safeInvocation,
      status: receipt.status,
      started_at: receipt.started_at,
      completed_at: receipt.completed_at,
      duration_ms: receipt.duration_ms,
      input_keys: receipt.input_keys || [],
      output_keys: receipt.output_keys || [],
      ...(receipt.error ? { error: receipt.error } : {}),
    };
    await db.prepare(`
      INSERT INTO agentsam_hook_execution (
        id, owner_id, hook_id, hook_key, source_kind, event_type, invocation_id,
        agent_run_id, session_id, conversation_id, status, duration_ms,
        input_keys_json, output_keys_json, decision, reason, error_code,
        error_message, receipt_json, correlation_json, ran_at_unix
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      executionId, ownerId, clean(correlation.hook_id) || null, hookKey, sourceKind,
      normalizeHookEvent(receipt.hook), clean(correlation.invocation_id) || null,
      clean(invocation.run_id || correlation.agent_run_id) || null,
      clean(invocation.session_id || correlation.session_id) || null,
      clean(correlation.conversation_id) || null, status, Math.max(0, Number(receipt.duration_ms || 0)),
      jsonText(receipt.input_keys, []), jsonText(receipt.output_keys, []),
      clean(correlation.decision) || null, clean(correlation.reason) || null,
      clean(error.code) || null, clean(error.message).slice(0, 512) || null,
      jsonText(safeReceipt, {}), jsonText(safeCorrelation, {}), ranAtUnix,
    ).run();
    return executionId;
  }

  async function listExecutions(query = {}) {
    const limit = Math.max(1, Math.min(500, Number(query.limit || 50)));
    const clauses = ['owner_id = ?'];
    const values = [clean(query.owner_id) || ownerId];
    if (query.hook_key) { clauses.push('hook_key = ?'); values.push(clean(query.hook_key)); }
    if (query.status) { clauses.push('status = ?'); values.push(clean(query.status)); }
    values.push(limit);
    const found = await rows(db.prepare(`
      SELECT * FROM agentsam_hook_execution
      WHERE ${clauses.join(' AND ')}
      ORDER BY ran_at_unix DESC, id DESC LIMIT ?
    `).bind(...values));
    return Object.freeze(found.map((row) => Object.freeze({
      ...row,
      input_keys: json(row.input_keys_json, []),
      output_keys: json(row.output_keys_json, []),
      receipt: json(row.receipt_json, {}),
      correlation: json(row.correlation_json, {}),
    })));
  }

  return Object.freeze({ ownerId, listHooks, getHook, upsertHook, setHookActive, removeHook, recordExecution, listExecutions });
}

/** Register active stored rows into the same runtime used by code/config hooks. */
export async function registerStoredHooks(runtime, store, options = {}) {
  if (!runtime?.register) throw new TypeError('hook_runtime_required');
  if (!store?.listHooks) throw new TypeError('hook_store_required');
  const configured = await store.listHooks({
    event_type: options.event_type,
    activeOnly: true,
    context: options.context || {},
  });
  const baseDirectory = options.cwd || (typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '');
  for (const row of configured) {
    let handler;
    if (row.handler_type === 'log_only') handler = async () => ({});
    else if (row.handler_type === 'command' || row.handler_type === 'http') {
      const { createConfiguredHookAdapter } = await import('./config.js');
      handler = createConfiguredHookAdapter({ type: row.handler_type, ...row.handler_config }, baseDirectory, options);
    } else if (typeof options.resolveHandler === 'function') {
      handler = await options.resolveHandler(row);
    }
    if (typeof handler !== 'function') throw new Error(`stored_hook_handler_unavailable:${row.hook_key}:${row.handler_type}`);
    runtime.register(row.event_type, {
      id: row.hook_key,
      priority: row.priority,
      timeout_ms: row.timeout_ms,
      failure_mode: row.failure_mode,
      enabled: row.is_active,
      matches: (envelope) => matchesHookInput(row.match, envelope.input),
      handler,
      metadata: {
        ...row.metadata,
        hook_source: 'stored',
        stored_hook_id: row.id,
        owner_id: row.owner_id,
        scope_type: row.scope_type,
        scope_ref: row.scope_ref,
      },
    });
  }
  return configured;
}
