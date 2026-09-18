import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

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

function ensureDirectory(options = {}) {
  const dir = localSessionDirectory(options);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    try { fs.chmodSync(dir, 0o700); } catch { /* best effort */ }
  }
  return dir;
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
  return {
    schema_version: LOCAL_SESSION_SCHEMA,
    id: validateSessionId(value.id || createLocalSessionId()),
    status,
    cwd: path.resolve(clean(value.cwd) || process.cwd()),
    title: clean(value.title) || sessionTitleFromInput(value.last_input),
    last_input: clean(value.last_input) || null,
    created_at: createdAt,
    updated_at: updatedAt,
    active_elapsed_ms: Math.max(0, Number(value.active_elapsed_ms || 0)),
    active_started_at: clean(value.active_started_at) || (status === 'active' ? updatedAt : null),
    model_key: clean(value.model_key) || null,
    provider_model_id: clean(value.provider_model_id) || null,
    reasoning_effort: clean(value.reasoning_effort) || null,
    requested_service_tier: clean(value.requested_service_tier) || null,
    actual_service_tier: clean(value.actual_service_tier) || null,
    provider_state: value.provider_state && typeof value.provider_state === 'object' ? { ...value.provider_state } : {},
    usage_snapshot: value.usage_snapshot && typeof value.usage_snapshot === 'object' ? structuredClone(value.usage_snapshot) : null,
    cumulative_usage: normalizeUsage(value.cumulative_usage || {}),
    total_cost_usd: Number(value.total_cost_usd || 0),
    cost_breakdown_usd: normalizeCostBreakdown(value.cost_breakdown_usd || {}),
    approved_projected_call_cost_usd: Number(value.approved_projected_call_cost_usd || 0),
    last_error: value.last_error && typeof value.last_error === 'object' ? structuredClone(value.last_error) : null,
  };
}

export function saveLocalSession(session, options = {}) {
  const normalized = normalizeLocalSession({ ...session, updated_at: now() });
  ensureDirectory(options);
  const filename = filenameFor(normalized.id, options);
  const temp = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== 'win32') {
    try { fs.chmodSync(temp, 0o600); } catch { /* best effort */ }
  }
  fs.renameSync(temp, filename);
  return normalized;
}

export function createLocalSession(value = {}, options = {}) {
  return saveLocalSession(normalizeLocalSession({ ...value, id: value.id || createLocalSessionId(), created_at: now(), updated_at: now() }), options);
}

export function loadLocalSession(sessionId, options = {}) {
  const filename = filenameFor(sessionId, options);
  if (!fs.existsSync(filename)) return null;
  const parsed = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (parsed?.schema_version !== LOCAL_SESSION_SCHEMA) throw new Error(`unsupported_local_session_schema:${parsed?.schema_version || 'missing'}`);
  return normalizeLocalSession(parsed);
}

export function updateLocalSession(sessionId, patch = {}, options = {}) {
  const current = loadLocalSession(sessionId, options);
  if (!current) throw new Error(`session_not_found:${sessionId}`);
  return saveLocalSession({ ...current, ...patch, id: current.id, created_at: current.created_at }, options);
}

export function listLocalSessions(options = {}) {
  const dir = localSessionDirectory(options);
  if (!fs.existsSync(dir)) return [];
  const cwd = clean(options.cwd) ? path.resolve(options.cwd) : '';
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? Math.min(options.limit, 100) : 20;
  const rows = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.startsWith('asess_') || !entry.name.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, entry.name), 'utf8'));
      if (parsed?.schema_version !== LOCAL_SESSION_SCHEMA) continue;
      const session = normalizeLocalSession(parsed);
      if (!cwd || session.cwd === cwd) rows.push(session);
    } catch { /* skip corrupt session file */ }
  }
  return rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, limit);
}
