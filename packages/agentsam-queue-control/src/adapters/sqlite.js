import { assertJobEnvelope } from '../contracts.js';

function rows(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.results)) return result.results;
  return [];
}

function changes(result) {
  if (Number.isFinite(Number(result?.changes))) return Number(result.changes);
  if (Number.isFinite(Number(result?.meta?.changes))) return Number(result.meta.changes);
  return 0;
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function parseJob(row) {
  if (!row) return null;
  const body = JSON.parse(row.job_json);
  return {
    ...body,
    status: row.status,
    available_at: Number(row.available_at),
    attempt: Number(row.attempt),
    lease_owner: row.lease_owner || null,
    lease_expires_at: row.lease_expires_at == null ? null : Number(row.lease_expires_at),
    lease_generation: Number(row.lease_generation || 0),
  };
}

const PRIORITY_SQL = "CASE priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END";

/**
 * Durable provider-neutral queue adapter over AgentSam's D1-shaped DB contract.
 * Local SQLite is the reference host; other hosts may supply the same prepare/bind API.
 */
export class SqliteQueueAdapter {
  constructor({
    database,
    leaseOwner = 'sqlite-' + process.pid,
    leaseTtlSeconds = 60,
  } = {}) {
    if (!database || typeof database.prepare !== 'function') {
      throw new TypeError('database with prepare() is required');
    }
    this.database = database;
    this.leaseOwner = clean(leaseOwner) || ('sqlite-' + process.pid);
    this.leaseTtlSeconds = Math.max(1, Number(leaseTtlSeconds) || 60);
  }

  async publish(queue, job) {
    assertJobEnvelope(job);
    const physicalQueue = clean(queue);
    if (!physicalQueue) throw new TypeError('queue is required');

    const existing = await this.database.prepare(
      'SELECT id, status FROM agentsam_queue_job WHERE account_id = ? AND idempotency_key = ? LIMIT 1'
    ).bind(job.account_id, job.idempotency_key).first();

    if (existing && existing.id !== job.id) {
      return {
        provider: 'sqlite',
        queue: physicalQueue,
        accepted: 0,
        deduplicated: true,
        existing_job_id: existing.id,
        existing_status: existing.status,
      };
    }

    const maxAttempts = Math.max(1, Number(job.retry?.max_attempts) || 3);
    const now = Math.floor(Date.now() / 1000);
    const sql = [
      'INSERT INTO agentsam_queue_job (',
      'id, account_id, physical_queue, logical_queue, kind, status, priority,',
      'available_at, attempt, max_attempts, idempotency_key, source_run_id,',
      'step_id, lease_owner, lease_expires_at, lease_generation, job_json,',
      'created_at_unix, updated_at_unix',
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      'ON CONFLICT(id) DO UPDATE SET',
      'physical_queue = excluded.physical_queue,',
      'logical_queue = excluded.logical_queue,',
      'kind = excluded.kind,',
      'status = excluded.status,',
      'priority = excluded.priority,',
      'available_at = excluded.available_at,',
      'attempt = excluded.attempt,',
      'max_attempts = excluded.max_attempts,',
      'source_run_id = excluded.source_run_id,',
      'step_id = excluded.step_id,',
      'lease_owner = excluded.lease_owner,',
      'lease_expires_at = excluded.lease_expires_at,',
      'lease_generation = excluded.lease_generation,',
      'job_json = excluded.job_json,',
      'result_json = NULL, error_json = NULL, completed_at_unix = NULL,',
      'updated_at_unix = excluded.updated_at_unix'
    ].join(' ');

    await this.database.prepare(sql).bind(
      job.id,
      job.account_id,
      physicalQueue,
      job.logical_queue,
      job.kind,
      job.status,
      job.priority,
      job.available_at,
      job.attempt,
      maxAttempts,
      job.idempotency_key,
      job.source_run_id,
      job.step_id,
      job.lease_owner,
      job.lease_expires_at,
      job.lease_generation || 0,
      JSON.stringify(job),
      job.created_at || now,
      now,
    ).run();

    return { provider: 'sqlite', queue: physicalQueue, accepted: 1, deduplicated: false };
  }

  async publishBatch(queue, jobs) {
    let accepted = 0;
    let deduplicated = 0;
    for (const job of jobs) {
      const result = await this.publish(queue, job);
      accepted += Number(result.accepted || 0);
      if (result.deduplicated) deduplicated += 1;
    }
    return { provider: 'sqlite', queue, accepted, deduplicated };
  }

  async pull(queue, max = 1, {
    now = Math.floor(Date.now() / 1000),
    owner = this.leaseOwner,
    ttl_seconds = this.leaseTtlSeconds,
  } = {}) {
    const physicalQueue = clean(queue);
    const leaseOwner = clean(owner);
    if (!physicalQueue) throw new TypeError('queue is required');
    if (!leaseOwner) throw new TypeError('lease owner is required');

    const limit = Math.max(1, Math.floor(Number(max) || 1));
    const ttl = Math.max(1, Math.floor(Number(ttl_seconds) || this.leaseTtlSeconds));
    const selectSql = [
      'SELECT * FROM agentsam_queue_job',
      'WHERE physical_queue = ?',
      "AND status IN ('queued','retry_scheduled','waiting','claimed')",
      'AND available_at <= ?',
      'AND (lease_expires_at IS NULL OR lease_expires_at <= ?)',
      'ORDER BY ' + PRIORITY_SQL + ' DESC, available_at ASC, created_at_unix ASC',
      'LIMIT ?'
    ].join(' ');

    const result = await this.database.prepare(selectSql).bind(
      physicalQueue, now, now, limit
    ).all();

    const claimed = [];
    for (const row of rows(result)) {
      const leaseExpiresAt = now + ttl;
      const updateSql = [
        "UPDATE agentsam_queue_job SET status = 'claimed',",
        'lease_owner = ?, lease_expires_at = ?,',
        'lease_generation = lease_generation + 1, updated_at_unix = ?',
        'WHERE id = ?',
        "AND status IN ('queued','retry_scheduled','waiting','claimed')",
        'AND available_at <= ?',
        'AND (lease_expires_at IS NULL OR lease_expires_at <= ?)'
      ].join(' ');
      const update = await this.database.prepare(updateSql).bind(
        leaseOwner, leaseExpiresAt, now, row.id, now, now
      ).run();

      if (changes(update) !== 1) continue;
      const current = await this.database.prepare(
        'SELECT * FROM agentsam_queue_job WHERE id = ? LIMIT 1'
      ).bind(row.id).first();
      if (current) claimed.push(parseJob(current));
    }
    return claimed;
  }

  async ack(jobOrId, {
    status = 'completed',
    result = null,
    error = null,
    now = Math.floor(Date.now() / 1000),
  } = {}) {
    const id = typeof jobOrId === 'string' ? jobOrId : jobOrId?.id;
    if (!clean(id)) throw new TypeError('job id is required');
    const sql = [
      'UPDATE agentsam_queue_job SET status = ?,',
      'lease_owner = NULL, lease_expires_at = NULL,',
      'result_json = ?, error_json = ?, completed_at_unix = ?, updated_at_unix = ?',
      'WHERE id = ?'
    ].join(' ');
    const update = await this.database.prepare(sql).bind(
      status,
      result == null ? null : JSON.stringify(result),
      error == null ? null : JSON.stringify(error),
      now,
      now,
      id,
    ).run();
    return { provider: 'sqlite', job_id: id, status, updated: changes(update) };
  }

  async release(jobOrId, {
    status = 'queued',
    available_at = Math.floor(Date.now() / 1000),
    now = Math.floor(Date.now() / 1000),
  } = {}) {
    const id = typeof jobOrId === 'string' ? jobOrId : jobOrId?.id;
    if (!clean(id)) throw new TypeError('job id is required');
    const sql = [
      'UPDATE agentsam_queue_job SET status = ?, available_at = ?,',
      'lease_owner = NULL, lease_expires_at = NULL, updated_at_unix = ?',
      'WHERE id = ?'
    ].join(' ');
    const update = await this.database.prepare(sql).bind(
      status, available_at, now, id
    ).run();
    return { provider: 'sqlite', job_id: id, status, updated: changes(update), available_at };
  }

  async get(id) {
    const row = await this.database.prepare(
      'SELECT * FROM agentsam_queue_job WHERE id = ? LIMIT 1'
    ).bind(id).first();
    return parseJob(row);
  }

  async depth(queue, { now = null, includeTerminal = false } = {}) {
    const clauses = ['physical_queue = ?'];
    const values = [queue];
    if (!includeTerminal) clauses.push("status NOT IN ('completed','failed','cancelled')");
    if (now != null) {
      clauses.push('available_at <= ?');
      values.push(now);
    }
    const sql = 'SELECT COUNT(*) AS count FROM agentsam_queue_job WHERE ' + clauses.join(' AND ');
    const row = await this.database.prepare(sql).bind(...values).first();
    return Number(row?.count || 0);
  }

  async ensureTopology(topology) {
    await this.database.prepare('SELECT id FROM agentsam_queue_job LIMIT 1').all();
    return {
      provider: 'sqlite',
      created: [],
      existing: [...new Set(Object.values(topology?.routes || {}))],
    };
  }
}
