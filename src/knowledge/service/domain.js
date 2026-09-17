import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { fingerprint, validateConfig } from '../config.js';

const workerPath = fileURLToPath(new URL('./job-worker.js', import.meta.url));
const TERMINAL = new Set(['completed', 'failed']);

export const knowledgeFail = (status, message) => Object.assign(new Error(message), { status });

function decode(row) {
  return row && ({
    id: row.id,
    status: row.status,
    attempts: row.attempts,
    created_at: row.created_at,
    updated_at: row.updated_at,
    result: row.result ? JSON.parse(row.result) : null,
    error: row.error,
  });
}

function normalizeRequest(body, repositories, allowEmbeddings) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw knowledgeFail(400, 'Expected a JSON object.');
  const keys = ['repository', 'operation', 'scope', 'include', 'exclude', 'embed', 'semantic', 'query', 'top_k', 'token_budget', 'generation_id', 'max_inputs', 'max_characters'];
  if (Object.keys(body).some((key) => !keys.includes(key))) throw knowledgeFail(400, 'Unknown job field.');
  const repo = Object.hasOwn(repositories, body.repository) && repositories[body.repository];
  if (!repo) throw knowledgeFail(404, 'Repository is not registered.');
  if (!['index', 'plan', 'search'].includes(body.operation)) throw knowledgeFail(400, 'operation must be index, plan, or search.');
  for (const key of ['embed', 'semantic']) {
    if (body[key] !== undefined && typeof body[key] !== 'boolean') throw knowledgeFail(400, `${key} must be a boolean.`);
  }
  if (((body.embed && body.operation !== 'plan') || body.semantic) && !allowEmbeddings) throw knowledgeFail(403, 'Embedding calls are disabled on this service.');
  if (body.include !== undefined && !Array.isArray(body.include)) throw knowledgeFail(400, 'include must be an array.');
  if (body.exclude !== undefined && !Array.isArray(body.exclude)) throw knowledgeFail(400, 'exclude must be an array.');
  if (body.operation === 'search' && (typeof body.query !== 'string' || !body.query.trim() || body.query.length > 8000)) {
    throw knowledgeFail(400, 'A query of 1..8000 characters is required.');
  }
  const bounded = (key, fallback, min, max) => {
    const value = body[key] ?? fallback;
    if (!Number.isInteger(value) || value < min || value > max) throw knowledgeFail(400, `${key} must be ${min}..${max}.`);
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
  try { checked = validateConfig(config); } catch (error) { throw knowledgeFail(400, error.message); }
  if (checked.scope.include.some((candidate) => !repo.config.scope.include.some((allowed) => allowed === '.' || candidate === allowed || candidate.startsWith(`${allowed}/`)))) {
    throw knowledgeFail(403, 'Requested include is outside the registered scope.');
  }
  return { request, config: checked, root: repo.root };
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

export function createKnowledgeServiceDomain({
  stateDir,
  repositories,
  allowEmbeddings = false,
  maxQueued = 32,
  maxFiles = 2000,
  jobTimeoutMs = 600000,
} = {}) {
  repositories = normalizeRepositories(repositories);
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const filename = path.join(stateDir, 'jobs.sqlite');
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, idem TEXT UNIQUE, digest TEXT NOT NULL,
      payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, result TEXT, error TEXT);
    CREATE INDEX IF NOT EXISTS jobs_pending ON jobs(status, created_at);`);
  fs.chmodSync(filename, 0o600);
  db.prepare("UPDATE jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END, error=CASE WHEN attempts>=3 THEN 'Interrupted three times; submit a new job after investigation.' ELSE NULL END WHERE status='running'").run();

  const events = new EventEmitter();
  events.setMaxListeners(128);
  const histories = new Map();
  let child = null;
  let activeJobId = null;
  let closing = false;
  let pumping = false;

  const getJob = (id) => decode(db.prepare('SELECT * FROM jobs WHERE id=?').get(id));
  const listRepositories = () => ({ repositories: Object.keys(repositories), embeddings_enabled: allowEmbeddings });
  const record = (job, phase = job?.status || 'unknown') => {
    if (!job) return;
    const event = { job: structuredClone(job), phase };
    const history = histories.get(job.id) || [];
    history.push(event);
    if (history.length > 64) history.shift();
    histories.set(job.id, history);
    events.emit(`job:${job.id}`, event);
  };

  const pump = () => {
    if (closing || pumping) return;
    const row = db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at,rowid LIMIT 1").get();
    if (!row) return;
    pumping = true;
    activeJobId = row.id;
    db.prepare("UPDATE jobs SET status='running',attempts=attempts+1,updated_at=? WHERE id=?").run(new Date().toISOString(), row.id);
    record(getJob(row.id), 'running');
    let response = null;
    let timedOut = false;
    child = fork(workerPath, [], { execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
    const timer = setTimeout(() => { timedOut = true; child?.kill('SIGKILL'); }, jobTimeoutMs);
    child.once('message', (value) => { response = value; });
    child.once('error', () => { response = { ok: false, error: 'Could not start indexing process.' }; });
    child.once('close', () => {
      clearTimeout(timer);
      child = null;
      activeJobId = null;
      if (!closing) {
        const ok = response?.ok && !timedOut;
        db.prepare('UPDATE jobs SET status=?,result=?,error=?,updated_at=? WHERE id=?').run(
          ok ? 'completed' : 'failed',
          ok ? JSON.stringify(response.result) : null,
          ok ? null : timedOut ? 'Job exceeded its time limit; narrow the scope.' : response?.error || 'Indexing process exited unexpectedly.',
          new Date().toISOString(),
          row.id,
        );
        record(getJob(row.id), ok ? 'completed' : 'failed');
      }
      pumping = false;
      if (!closing) setImmediate(pump);
    });
    const payload = JSON.parse(row.payload);
    const registered = repositories[payload.request.repository];
    if (!registered || registered.config.repository_id !== payload.config.repository_id || fingerprint(registered.config.scope) !== payload.registered_scope || (!allowEmbeddings && ((payload.request.embed && payload.request.operation !== 'plan') || payload.request.semantic))) {
      response = { ok: false, error: 'Repository registration changed; resubmit this job.' };
      child.kill();
      return;
    }
    child.send({ ...payload, root: registered.root, filename: path.join(stateDir, 'knowledge.sqlite'), maxFiles });
  };

  const schedulePump = () => setImmediate(pump);

  const submitJob = (body, idempotencyKey) => {
    if (closing) throw knowledgeFail(503, 'Service is stopping.');
    const payload = normalizeRequest(body, repositories, allowEmbeddings);
    payload.registered_scope = fingerprint(repositories[payload.request.repository].config.scope);
    const key = idempotencyKey;
    if (key !== undefined && (typeof key !== 'string' || !/^[\w:.-]{1,128}$/.test(key))) throw knowledgeFail(400, 'Invalid Idempotency-Key.');
    const digest = fingerprint(payload);
    const idem = key ? fingerprint([payload.config.repository_id, payload.registered_scope, key]) : null;
    const previous = idem && db.prepare('SELECT * FROM jobs WHERE idem=?').get(idem);
    if (previous) {
      if (previous.digest !== digest) throw knowledgeFail(409, 'Idempotency-Key already used for a different job.');
      return decode(previous);
    }
    if (db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running')").get().n >= maxQueued) {
      throw knowledgeFail(429, 'Job queue is full; retry later with the same Idempotency-Key.');
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO jobs(id,idem,digest,payload,status,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?)").run(id, idem, digest, JSON.stringify(payload), now, now);
    const job = getJob(id);
    record(job, 'queued');
    schedulePump();
    return job;
  };

  const requireJob = (id) => {
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw knowledgeFail(400, 'Invalid job id.');
    const job = getJob(id);
    if (!job) throw knowledgeFail(404, 'Job not found.');
    return job;
  };

  const watchJob = (id, listener) => {
    const current = requireJob(id);
    const handler = (event) => listener(structuredClone(event));
    events.on(`job:${id}`, handler);
    const history = histories.get(id);
    if (history?.length) {
      for (const event of history) listener(structuredClone(event));
    } else {
      listener({ job: structuredClone(current), phase: current.status });
    }
    if (TERMINAL.has(current.status)) {
      events.off(`job:${id}`, handler);
      return () => {};
    }
    return () => events.off(`job:${id}`, handler);
  };

  schedulePump();

  return {
    listRepositories,
    getJob: requireJob,
    submitJob,
    watchJob,
    get activeJobId() { return activeJobId; },
    get isClosing() { return closing; },
    async close() {
      closing = true;
      if (child) {
        const active = child;
        await new Promise((resolve) => {
          active.once('close', resolve);
          active.kill('SIGKILL');
        });
      }
      events.removeAllListeners();
      db.close();
    },
  };
}
