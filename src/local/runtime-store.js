import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createLocalSqliteDatabase } from './sqlite.js';
import { applyRuntimeMigrations } from './migrations.js';
import { findCliProjectRoot } from '../lib/cli-preferences.js';
import { getLocalDatabasePath, tryReadProjectConfig } from '../lib/project-config.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function hash(value) { return createHash('sha256').update(String(value || '')).digest('hex'); }

export const SQLITE_RUNTIME_CAPABILITIES = Object.freeze({
  transactions: true,
  relational_queries: true,
  ttl_cleanup: 'application_managed',
  remote_shared_state: false,
  local_only: true,
  concurrent_writers: 'sqlite_serialized',
  migrations: true,
  vector_search: false,
  blob_storage: false,
  distributed_actor_semantics: false,
});

export function runtimeDatabasePath(startDir = process.cwd()) {
  const root = findCliProjectRoot(startDir);
  return path.resolve(root, getLocalDatabasePath(tryReadProjectConfig(root)));
}

async function withStore(cwd, fn) {
  const db = await createLocalSqliteDatabase(runtimeDatabasePath(cwd));
  try {
    await applyRuntimeMigrations(db);
    return await fn(db);
  } finally {
    db.close();
  }
}

export function createRuntimeRunId() {
  return `arun_${randomUUID()}`;
}

export async function startRuntimeRun(value = {}) {
  const id = clean(value.id) || createRuntimeRunId();
  await withStore(value.projectRoot || value.cwd, async (db) => {
    await db.prepare(`
      INSERT INTO agentsam_agent_run (
        id, account_id, source_client, surface, mode, model_key,
        reasoning_effort, requested_service_tier, status, started_at_unix, updated_at_unix
      ) VALUES (?, ?, 'agentsam-cli', 'cli', ?, ?, ?, ?, 'running', unixepoch(), unixepoch())
    `).bind(
      id,
      clean(value.account_id) || null,
      clean(value.mode) || 'agent',
      clean(value.model_key) || null,
      clean(value.reasoning_effort) || null,
      clean(value.service_tier) || null,
    ).run();
  });
  return id;
}

export async function finishRuntimeRun(value = {}) {
  if (!clean(value.id)) return;
  await withStore(value.projectRoot || value.cwd, async (db) => {
    const usage = value.usage || {};
    await db.prepare(`
      UPDATE agentsam_agent_run
      SET status = ?,
          actual_service_tier = COALESCE(?, actual_service_tier),
          input_tokens = ?,
          cached_input_tokens = ?,
          output_tokens = ?,
          reasoning_tokens = ?,
          cost_usd = ?,
          error_code = ?,
          error_message = ?,
          completed_at_unix = unixepoch(),
          updated_at_unix = unixepoch(),
          latency_ms = ?
      WHERE id = ?
    `).bind(
      clean(value.status) || 'completed',
      clean(value.actual_service_tier) || null,
      Number(usage.input_tokens || 0),
      Number(usage.cached_input_tokens || 0),
      Number(usage.output_tokens || 0),
      Number(usage.reasoning_tokens || 0),
      Math.max(0, Number(value.cost_usd || 0)),
      clean(value.error_code) || null,
      clean(value.error_message) || null,
      Number.isFinite(Number(value.latency_ms)) ? Math.max(0, Math.round(Number(value.latency_ms))) : null,
      value.id,
    ).run();
  });
}

export async function recordRuntimeCompaction(value = {}) {
  if (!clean(value.agent_run_id)) return null;
  const id = clean(value.id) || `cmp_${randomUUID()}`;
  const summary = clean(value.summary_text);
  const before = Math.max(0, Math.round(Number(value.tokens_before || 0)));
  const after = Math.max(0, Math.round(Number(value.tokens_after || 0)));
  const sourceHash = hash(summary || JSON.stringify(value.metadata || {}));

  await withStore(value.projectRoot || value.cwd, async (db) => {
    await db.prepare(`
      INSERT INTO agentsam_compaction_events (
        id, account_id, agent_run_id, compaction_type, compaction_scope,
        compaction_strategy, source_kind, content_hash, provider, model_key,
        tokens_before, tokens_after, status, summary_text, summary_json,
        metrics_json, metadata_json, source_stored
      ) VALUES (?, ?, ?, 'context_summary', 'agent_run', 'summarize', ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)
    `).bind(
      id,
      clean(value.account_id) || null,
      value.agent_run_id,
      clean(value.source_kind) || 'api',
      sourceHash,
      clean(value.provider),
      clean(value.model_key),
      before,
      after,
      summary,
      JSON.stringify({ summary }),
      JSON.stringify({ tokens_before: before, tokens_after: after, tokens_saved: before - after }),
      JSON.stringify(value.metadata || {}),
      clean(value.source_stored) || 'local:agentsam_compaction_events',
    ).run();

    if (summary) {
      const digestId = `ctx_${randomUUID()}`;
      const digestHash = hash(`${value.agent_run_id}:${id}:${summary}`);
      await db.prepare(`
        INSERT INTO agentsam_context_digest (
          id, account_id, digest_type, agent_run_id, session_id,
          source_hash, digest_hash, raw_size_bytes, reduced_size_bytes,
          token_count, digest_text, generation_model, compaction_event_id
        ) VALUES (?, ?, 'session', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        digestId,
        clean(value.account_id) || null,
        value.agent_run_id,
        clean(value.session_id) || null,
        sourceHash,
        digestHash,
        Number(value.raw_size_bytes || 0) || null,
        Buffer.byteLength(summary, 'utf8'),
        after || Math.ceil(summary.length / 4),
        summary,
        clean(value.model_key) || null,
        id,
      ).run();
    }
  });
  return id;
}

export async function pruneExpiredRuntimeState(value = {}) {
  const nowUnix = Number.isFinite(Number(value.nowUnix)) ? Math.floor(Number(value.nowUnix)) : Math.floor(Date.now() / 1000);
  return withStore(value.projectRoot || value.cwd, async (db) => {
    const digests = await db.prepare('DELETE FROM agentsam_context_digest WHERE expires_at_unix IS NOT NULL AND expires_at_unix <= ?').bind(nowUnix).run();
    const compactions = await db.prepare('DELETE FROM agentsam_compaction_events WHERE expires_at_epoch IS NOT NULL AND expires_at_epoch <= ?').bind(nowUnix).run();
    const approvals = await db.prepare("UPDATE agentsam_approval_queue SET status = 'expired' WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ?").bind(nowUnix).run();
    return { digests: Number(digests.changes || 0), compactions: Number(compactions.changes || 0), approvals_expired: Number(approvals.changes || 0) };
  });
}
