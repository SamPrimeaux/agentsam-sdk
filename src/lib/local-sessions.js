import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { findCliProjectRoot } from './cli-preferences.js';
import { runtimeDatabasePath, SQLITE_RUNTIME_CAPABILITIES } from '../local/runtime-store.js';
import { createLocalSqliteDatabaseSync } from '../local/sqlite.js';
import { applyRuntimeMigrationsSync } from '../local/migrations.js';

export const LOCAL_SESSION_SCHEMA = 'agentsam-local-session-v1';

function clean(value) { return value == null ? '' : String(value).trim(); }
function now() { return new Date().toISOString(); }

export function localSessionDirectory(options = {}) {
  const home = path.resolve(clean(options.home) || clean(options.env?.HOME) || clean(options.env?.USERPROFILE) || os.homedir());
  return path.join(home, '.agentsam', 'sessions');
}

export function createLocalSessionId() {
  return `asess_${randomUUID()}`;
}

export function sessionTitleFromInput(input, maxChars = 72) {
  const compact = clean(input).replace(/\s+/g, ' ');
  if (!compact) return 'New Agent Sam session';
  return compact.length <= maxChars ? compact : `${compact.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function validateSessionId(sessionId) {
  const id = clean(sessionId);
  if (!/^asess_[0-9a-f-]{36}$/i.test(id)) throw new Error(`invalid_session_id:${id || 'empty'}`);
  return id;
}

function filenameFor(sessionId, options = {}) {
  return path.join(localSessionDirectory(options), `${validateSessionId(sessionId)}.json`);
}

function projectRoot(value = {}, options = {}) {
  return findCliProjectRoot(options.projectRoot || value.project_root || value.cwd || options.cwd || process.cwd());
}

function withSessionDb(root, fn) {
  const db = createLocalSqliteDatabaseSync(runtimeDatabasePath(root));
  try {
    applyRuntimeMigrationsSync(db);
    return fn(db);
  } finally {
    db.close();
  }
}

function safeProviderState(value) {
  if (!value || typeof value !== 'object') return {};
  // Opaque response IDs allow provider-side continuation. Message arrays and
  // compaction input can carry prompts, tool output, or credential values.
  return {
    ...(clean(value.provider) ? { provider: clean(value.provider) } : {}),
    ...(clean(value.previous_response_id) ? { previous_response_id: clean(value.previous_response_id) } : {}),
  };
}

function safeLastError(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    code: clean(value.code) || null,
    kind: clean(value.kind) || null,
    source: clean(value.source) || null,
  };
}

function safeUsageSnapshot(value) {
  if (!value || typeof value !== 'object') return null;
  const inputTokens = Number(value.current_context?.input_tokens);
  const windowTokens = Number(value.current_context?.window_tokens);
  return {
    current_context: {
      input_tokens: Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0,
      window_tokens: Number.isFinite(windowTokens) ? Math.max(0, windowTokens) : null,
    },
  };
}

function normalizeUsage(value = {}) {
  return {
    input_tokens: Number(value.input_tokens || 0),
    output_tokens: Number(value.output_tokens || 0),
    cached_input_tokens: Number(value.cached_input_tokens || 0),
    cache_write_tokens: Number(value.cache_write_tokens || 0),
    reasoning_tokens: Number(value.reasoning_tokens || 0),
  };
}

function normalizeCostBreakdown(value = {}) {
  return {
    input: Number(value.input || 0),
    cached_input: Number(value.cached_input || 0),
    cache_write: Number(value.cache_write || 0),
    output: Number(value.output || 0),
  };
}

export function localSessionElapsedMs(session = {}, at = Date.now()) {
  const accumulated = Math.max(0, Number(session.active_elapsed_ms || 0));
  const startedAt = Date.parse(clean(session.active_started_at));
  if (clean(session.status) !== 'active' || !Number.isFinite(startedAt)) return accumulated;
  return accumulated + Math.max(0, Number(at) - startedAt);
}

export function normalizeLocalSession(value = {}) {
  const createdAt = clean(value.created_at) || now();
  const status = clean(value.status) || 'active';
  const updatedAt = clean(value.updated_at) || createdAt;
  const root = projectRoot(value);
  const dbPath = runtimeDatabasePath(root);
  const relativeDbPath = path.relative(root, dbPath);
  return {
    schema_version: LOCAL_SESSION_SCHEMA,
    id: validateSessionId(value.id || createLocalSessionId()),
    status,
    project_root: root,
    storage: { runtime: 'sqlite', path: relativeDbPath.startsWith('..') ? dbPath : relativeDbPath, remote: null, capabilities: SQLITE_RUNTIME_CAPABILITIES },
    cwd: path.resolve(clean(value.cwd) || process.cwd()),
    title: clean(value.title) || 'Agent Sam session',
    last_input: null,
    created_at: createdAt,
    updated_at: updatedAt,
    active_elapsed_ms: Math.max(0, Number(value.active_elapsed_ms || 0)),
    active_started_at: clean(value.active_started_at) || (status === 'active' ? updatedAt : null),
    model_key: clean(value.model_key) || null,
    provider_model_id: clean(value.provider_model_id) || null,
    reasoning_effort: clean(value.reasoning_effort) || null,
    requested_service_tier: clean(value.requested_service_tier) || null,
    actual_service_tier: clean(value.actual_service_tier) || null,
    provider_state: safeProviderState(value.provider_state),
    usage_snapshot: safeUsageSnapshot(value.usage_snapshot),
    cumulative_usage: normalizeUsage(value.cumulative_usage || {}),
    total_cost_usd: Number(value.total_cost_usd || 0),
    cost_breakdown_usd: normalizeCostBreakdown(value.cost_breakdown_usd || {}),
    approved_projected_call_cost_usd: Number(value.approved_projected_call_cost_usd || 0),
    last_error: safeLastError(value.last_error),
  };
}

export function saveLocalSession(session, options = {}) {
  const normalized = normalizeLocalSession({ ...session, project_root: projectRoot(session, options), updated_at: now() });
  withSessionDb(normalized.project_root, (db) => {
    db.prepare(`
      INSERT INTO agentsam_project_sessions (id, project_root, cwd, status, title, state_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        cwd = excluded.cwd, status = excluded.status, title = excluded.title,
        state_json = excluded.state_json, updated_at = excluded.updated_at
    `).run(normalized.id, normalized.project_root, normalized.cwd, normalized.status,
      normalized.title, JSON.stringify(normalized), normalized.created_at, normalized.updated_at);
  });
  return normalized;
}

export function createLocalSession(value = {}, options = {}) {
  return saveLocalSession(normalizeLocalSession({ ...value, id: value.id || createLocalSessionId(), created_at: now(), updated_at: now() }), options);
}

export function loadLocalSession(sessionId, options = {}) {
  const root = projectRoot({}, options);
  const dbPath = runtimeDatabasePath(root);
  if (fs.existsSync(dbPath)) {
    const row = withSessionDb(root, (db) => db.prepare(
      'SELECT state_json FROM agentsam_project_sessions WHERE id = ? AND project_root = ?'
    ).get(validateSessionId(sessionId), root));
    if (row) return normalizeLocalSession(JSON.parse(row.state_json));
  }
  // Read-only compatibility with older ~/.agentsam/sessions/*.json state.
  // Import only when the saved cwd belongs to the selected project; never
  // create new home-level session files or resume a different project's row.
  const filename = filenameFor(sessionId, options);
  if (!fs.existsSync(filename)) return null;
  const parsed = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (parsed?.schema_version !== LOCAL_SESSION_SCHEMA) throw new Error(`unsupported_local_session_schema:${parsed?.schema_version || 'missing'}`);
  if (projectRoot(parsed) !== root) return null;
  return saveLocalSession(parsed, { projectRoot: root });
}

export function updateLocalSession(sessionId, patch = {}, options = {}) {
  const current = loadLocalSession(sessionId, options);
  if (!current) throw new Error(`session_not_found:${sessionId}`);
  return saveLocalSession({ ...current, ...patch, id: current.id, created_at: current.created_at }, options);
}

export function listLocalSessions(options = {}) {
  const root = projectRoot({}, options);
  const dir = localSessionDirectory(options);
  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.startsWith('asess_') || !entry.name.endsWith('.json')) continue;
      try { loadLocalSession(entry.name.slice(0, -5), { ...options, projectRoot: root }); }
      catch { /* legacy corrupt files remain untouched */ }
    }
  }
  if (!fs.existsSync(runtimeDatabasePath(root))) return [];
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? Math.min(options.limit, 100) : 20;
  return withSessionDb(root, (db) => db.prepare(
    'SELECT state_json FROM agentsam_project_sessions WHERE project_root = ? ORDER BY updated_at DESC LIMIT ?'
  ).all(root, limit).map((row) => normalizeLocalSession(JSON.parse(row.state_json))));
}
