import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { fingerprint, validateConfig } from '../config.js';

const defaultWorkerPath = fileURLToPath(new URL('./job-worker.js', import.meta.url));
const TERMINAL_STATUSES = new Set(['completed', 'failed']);

export function serviceError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

function decode(row) {
  return row && {
    id: row.id,
    status: row.status,
    attempts: row.attempts,
    created_at: row.created_at,
    updated_at: row.updated_at,
    result: row.result ? JSON.parse(row.result) : null,
    error: row.error,
  };
}

function normalizeRepositories(repositories) {
  if (!repositories || !Object.keys(repositories).length) throw new Error('Register at least one repository.');
  return Object.fromEntries(Object.entries(repositories).map(([name, repo]) => {
    if (!/^[a-z][a-z0-9_-]{0,47}$/.test(name)) throw new Error('Invalid repository alias.');
    const root = fs.realpathSync(repo.root);
    if (!fs.statSync(root).isDirectory()) throw new Error('Repository root must be a directory.');
    const config = validateConfig(repo.config);
    if (config.storage.driver !== 'sqlite') throw new Error('This service release uses its durable SQLite volume; Postgres is not configured by this preset.');
    return [name, { root, config }];
  }));
}

function normalizeRequest(body, repositories, allowEmbeddings) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw serviceError(400, 'Expected a JSON object.', 'INVALID_ARGUMENT');
  const keys = ['repository', 'operation', 'scope', 'include', 'exclude', 'embed', 'semantic', 'query', 'top_k', 'token_budget', 'generation_id', 'max_inputs', 'max_characters'];
  if (Object.keys(body).some(k => !keys.includes(k))) throw serviceError(400, 'Unknown job field.', 'INVALID_ARGUMENT');
  const repo = Object.hasOwn(repositories, body.repository) && repositories[body.repository];
  if (!repo) throw serviceError(404, 'Repository is not registered.', 'NOT_FOUND');
  if (!['index', 'plan', 'search'].includes(body.operation)) throw serviceError(400, 'operation must be index, plan, or search.', 'INVALID_ARGUMENT');
  for (const key of ['embed', 'semantic']) {
    if (body[key] !== undefined && typeof body[key] !== 'boolean') throw serviceError(400, `${key} must be a boolean.`, 'INVALID_ARGUMENT');
  }
  if (((body.embed && body.operation !== 'plan') || body.semantic) && !allowEmbeddings) {
    throw serviceError(403, 'Embedding calls are disabled on this service.', 'PERMISSION_DENIED');
  }
  if (body.exclude !== undefined && !Array.isArray(body.exclude)) throw serviceError(400, 'exclude must be an array.', 'INVALID_ARGUMENT');
  if (body.operation === 'search' && (typeof body.query !== 'string' || !body.query.trim() || body.query.length > 8000)) {
    throw serviceError(400, 'A query of 1..8000 characters is required.', 'INVALID_ARGUMENT');
  }
  const bounded = (key, fallback, min, max) => {
    const value = body[key] ?? fallback;
    if (!Number.isInteger(value) || value < min || value > max) throw serviceError(400, `${key} must be ${min}..${max}.`, 'INVALID_ARGUMENT');
    return value;
  };
  const request = {
    ...body,
    embed: body.embed ?? false,
    semantic: body.semantic ?? false,
    max_inputs: bounded('max_inputs', 100, 0, 1000),
    max_characters: bounded('max_characters', 200000, 0, 2000000),
    top_k: bounded('top_k', 8, 1, 8),
    token_budget: bounded('token_budget', 6000, 256, 6000),
  };
  const config = structuredClone(repo.config);
  if (body.scope !== undefined) config.scope.name = body.scope;
  if (body.include !== undefined) config.scope.include = body.include;
  if (body.exclude !== undefined) config.scope.exclude = [...config.scope.exclude, ...body.exclude];
  let checked;
  try {
    checked = validateConfig(config);
  } catch (error) {
    throw serviceError(400, error.message, 'INVALID_ARGUMENT');
  }
  if (checked.scope.include.some(p => !repo.config.scope.include.some(allowed => allowed === '.' || p === allowed || p.startsWith(allowed + '/')))) {
    throw serviceError(403, 'Requested include is outside the registered scope.', 'PERMISSION_DENIED');
  }
  return { request, config: checked, root: repo.root };
}

export function createKnowledgeJobEngine({
  stateDir,
  repositories,
  allowEmbeddings = false,
  maxQueued = 32,
  maxFiles = 2000,
  jobTimeoutMs = 600000,
  workerPath = defaultWorkerPath,
} = {}) {
  const registry = normalizeRepositories(repositories);
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const jobsFile = path.join(stateDir, 'jobs.sqlite');
  const db = new DatabaseSync(jobsFile);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, idem TEXT UNIQUE, digest TEXT NOT NULL,
      payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, result TEXT, error TEXT);
    CREATE INDEX IF NOT EXISTS jobs_pending ON jobs(status, created_at);`);
  fs.chmodSync(jobsFile, 0o600);
  db.prepare("UPDATE jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END, error=CASE WHEN attempts>=3 THEN 'Interrupted three times; submit a new job after investigation.' ELSE NULL END WHERE status='running'").run();

  let child = null;
  let closing = false;
  let closed = false;
  let pumping = false;
  const watchers = new Map();

  const getRaw = id => decode(db.prepare('SELECT * FROM jobs WHERE id=?').get(id));
  const publish = job => {
    const listeners = watchers.get(job.id);
    if (!listeners) return;
    for (const listener of [...listeners]) {
      try { listener(job); } catch { /* transport observers cannot break durable state transitions */ }
    }
    if (TERMINAL_STATUSES.has(job.status)) watchers.delete(job.id);
  };
  const updateStatus = (id, status, { result = null, error = null } = {}) => {
    db.prepare('UPDATE jobs SET status=?,result=?,error=?,updated_at=? WHERE id=?').run(
      status,
      result === null ? null : JSON.stringify(result),
      error,
      new Date().toISOString(),
      id,
    );
    const job = getRaw(id);
    publish(job);
    return job;
  };

  const pump = () => {
    if (closing || pumping) return;
    const row = db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at,rowid LIMIT 1").get();
    if (!row) return;
    pumping = true;
    db.prepare("UPDATE jobs SET status='running',attempts=attempts+1,updated_at=? WHERE id=?").run(new Date().toISOString(), row.id);
    publish(getRaw(row.id));
    let response = null;
    let timedOut = false;
    child = fork(workerPath, [], { execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
    const timer = setTimeout(() => { timedOut = true; child?.kill('SIGKILL'); }, jobTimeoutMs);
    child.once('message', value => { response = value; });
    child.once('error', () => { response = { ok: false, error: 'Could not start indexing process.' }; });
    child.once('close', () => {
      clearTimeout(timer);
      child = null;
      if (!closing) {
        const ok = response?.ok && !timedOut;
        updateStatus(row.id, ok ? 'completed' : 'failed', {
          result: ok ? response.result : null,
          error: ok ? null : timedOut ? 'Job exceeded its time limit; narrow the scope.' : response?.error || 'Indexing process exited unexpectedly.',
        });
      }
      pumping = false;
      if (!closing) setImmediate(pump);
    });
    const payload = JSON.parse(row.payload);
    const registered = registry[payload.request.repository];
    if (!registered || registered.config.repository_id !== payload.config.repository_id || fingerprint(registered.config.scope) !== payload.registered_scope || (!allowEmbeddings && ((payload.request.embed && payload.request.operation !== 'plan') || payload.request.semantic))) {
      response = { ok: false, error: 'Repository registration changed; resubmit this job.' };
      child.kill();
      return;
    }
    child.send({ ...payload, root: registered.root, filename: path.join(stateDir, 'knowledge.sqlite'), maxFiles });
  };

  const api = {
    listRepositories() {
      return {
        repositories: Object.entries(registry).map(([alias, repo]) => ({ alias, repository_id: repo.config.repository_id })),
        embeddings_enabled: allowEmbeddings,
      };
    },
    getJob(id) {
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw serviceError(400, 'Invalid job id.', 'INVALID_ARGUMENT');
      const job = getRaw(id);
      if (!job) throw serviceError(404, 'Job not found.', 'NOT_FOUND');
      return job;
    },
    submitJob(body, { idempotencyKey } = {}) {
      if (closing) throw serviceError(503, 'Service is stopping.', 'UNAVAILABLE');
      const payload = normalizeRequest(body, registry, allowEmbeddings);
      payload.registered_scope = fingerprint(registry[payload.request.repository].config.scope);
      if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || !/^[\w:.-]{1,128}$/.test(idempotencyKey))) {
        throw serviceError(400, 'Invalid Idempotency-Key.', 'INVALID_ARGUMENT');
      }
      const digest = fingerprint(payload);
      const idem = idempotencyKey ? fingerprint([payload.config.repository_id, payload.registered_scope, idempotencyKey]) : null;
      const previous = idem && db.prepare('SELECT * FROM jobs WHERE idem=?').get(idem);
      if (previous) {
        if (previous.digest !== digest) throw serviceError(409, 'Idempotency-Key already used for a different job.', 'CONFLICT');
        return { job: decode(previous), created: false };
      }
      if (db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running')").get().n >= maxQueued) {
        throw serviceError(429, 'Job queue is full; retry later with the same Idempotency-Key.', 'RESOURCE_EXHAUSTED');
      }
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare("INSERT INTO jobs(id,idem,digest,payload,status,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?)").run(
        id,
        idem,
        digest,
        JSON.stringify(payload),
        now,
        now,
      );
      const job = getRaw(id);
      publish(job);
      setImmediate(pump);
      return { job, created: true };
    },
    watchJob(id, listener) {
      if (typeof listener !== 'function') throw new TypeError('watchJob listener must be a function.');
      const current = api.getJob(id);
      listener(current);
      if (TERMINAL_STATUSES.has(current.status)) return () => {};
      let listeners = watchers.get(id);
      if (!listeners) watchers.set(id, listeners = new Set());
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) watchers.delete(id);
      };
    },
    isClosing() {
      return closing;
    },
    async close() {
      if (closed) return;
      closing = true;
      watchers.clear();
      if (child) {
        const active = child;
        await new Promise(resolve => { active.once('close', resolve); active.kill('SIGKILL'); });
      }
      db.close();
      closed = true;
    },
  };

  setImmediate(pump);
  return api;
}
