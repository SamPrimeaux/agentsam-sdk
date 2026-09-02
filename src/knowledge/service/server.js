import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { fork } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { fingerprint, validateConfig } from '../config.js';

const workerPath = fileURLToPath(new URL('./job-worker.js', import.meta.url));
const fail = (status, message) => Object.assign(new Error(message), { status });
const decode = row => row && ({ id: row.id, status: row.status, attempts: row.attempts, created_at: row.created_at,
  updated_at: row.updated_at, result: row.result ? JSON.parse(row.result) : null, error: row.error });

function normalizeRequest(body, repositories, allowEmbeddings) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'Expected a JSON object.');
  const keys = ['repository', 'operation', 'scope', 'include', 'exclude', 'embed', 'semantic', 'query', 'top_k', 'token_budget', 'generation_id', 'max_inputs', 'max_characters'];
  if (Object.keys(body).some(k => !keys.includes(k))) throw fail(400, 'Unknown job field.');
  const repo = Object.hasOwn(repositories, body.repository) && repositories[body.repository];
  if (!repo) throw fail(404, 'Repository is not registered.');
  if (!['index', 'plan', 'search'].includes(body.operation)) throw fail(400, 'operation must be index, plan, or search.');
  for (const key of ['embed', 'semantic']) if (body[key] !== undefined && typeof body[key] !== 'boolean') throw fail(400, `${key} must be a boolean.`);
  if (((body.embed && body.operation !== 'plan') || body.semantic) && !allowEmbeddings) throw fail(403, 'Embedding calls are disabled on this service.');
  if (body.exclude !== undefined && !Array.isArray(body.exclude)) throw fail(400, 'exclude must be an array.');
  if (body.operation === 'search' && (typeof body.query !== 'string' || !body.query.trim() || body.query.length > 8000)) throw fail(400, 'A query of 1..8000 characters is required.');
  const bounded = (key, fallback, min, max) => {
    const value = body[key] ?? fallback;
    if (!Number.isInteger(value) || value < min || value > max) throw fail(400, `${key} must be ${min}..${max}.`);
    return value;
  };
  const request = { ...body, embed: body.embed ?? false, semantic: body.semantic ?? false,
    max_inputs: bounded('max_inputs', 100, 0, 1000), max_characters: bounded('max_characters', 200000, 0, 2000000),
    top_k: bounded('top_k', 8, 1, 100), token_budget: bounded('token_budget', 8000, 256, 32000) };
  const config = structuredClone(repo.config);
  if (body.scope !== undefined) config.scope.name = body.scope;
  if (body.include !== undefined) config.scope.include = body.include;
  if (body.exclude !== undefined) config.scope.exclude = [...config.scope.exclude, ...body.exclude];
  let checked;
  try { checked = validateConfig(config); } catch (error) { throw fail(400, error.message); }
  // Request scopes can narrow a registered repository's scope, never widen it.
  if (checked.scope.include.some(p => !repo.config.scope.include.some(allowed => allowed === '.' || p === allowed || p.startsWith(allowed + '/')))) throw fail(403, 'Requested include is outside the registered scope.');
  return { request, config: checked, root: repo.root };
}

async function readBody(req) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 16384) throw fail(413, 'Job body exceeds 16 KiB.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw fail(400, 'Invalid JSON.'); }
}

/** Trusted backend API. The calling host must authorize its user before submitting jobs. */
export async function startKnowledgeService({ stateDir, repositories, token, port = 8792, host = '127.0.0.1',
  allowEmbeddings = false, maxQueued = 32, maxFiles = 2000, jobTimeoutMs = 600000 } = {}) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 256) throw new Error('Service token must be 32..256 characters.');
  if (!repositories || !Object.keys(repositories).length) throw new Error('Register at least one repository.');
  repositories = Object.fromEntries(Object.entries(repositories).map(([name, repo]) => {
    if (!/^[a-z][a-z0-9_-]{0,47}$/.test(name)) throw new Error('Invalid repository alias.');
    const root = fs.realpathSync(repo.root);
    if (!fs.statSync(root).isDirectory()) throw new Error('Repository root must be a directory.');
    const config = validateConfig(repo.config);
    if (config.storage.driver !== 'sqlite') throw new Error('This service release uses its durable SQLite volume; Postgres is not configured by this preset.');
    return [name, { root, config }];
  }));
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(stateDir, 'jobs.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, idem TEXT UNIQUE, digest TEXT NOT NULL,
      payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, result TEXT, error TEXT);
    CREATE INDEX IF NOT EXISTS jobs_pending ON jobs(status, created_at);`);
  fs.chmodSync(path.join(stateDir, 'jobs.sqlite'), 0o600);
  // Interrupted work reuses SDK caches. Bound restarts so a poison job cannot loop forever.
  db.prepare("UPDATE jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END, error=CASE WHEN attempts>=3 THEN 'Interrupted three times; submit a new job after investigation.' ELSE NULL END WHERE status='running'").run();
  let child = null, closing = false, pumping = false;
  const get = id => decode(db.prepare('SELECT * FROM jobs WHERE id=?').get(id));
  const pump = () => {
    if (closing || pumping) return;
    const row = db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at,rowid LIMIT 1").get();
    if (!row) return;
    pumping = true;
    db.prepare("UPDATE jobs SET status='running',attempts=attempts+1,updated_at=? WHERE id=?").run(new Date().toISOString(), row.id);
    let response = null, timedOut = false;
    child = fork(workerPath, [], { execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
    const timer = setTimeout(() => { timedOut = true; child?.kill('SIGKILL'); }, jobTimeoutMs);
    child.once('message', value => { response = value; });
    child.once('error', () => { response = { ok: false, error: 'Could not start indexing process.' }; });
    child.once('close', () => {
      clearTimeout(timer); child = null;
      if (!closing) {
        const ok = response?.ok && !timedOut;
        db.prepare('UPDATE jobs SET status=?,result=?,error=?,updated_at=? WHERE id=?').run(ok ? 'completed' : 'failed', ok ? JSON.stringify(response.result) : null,
          ok ? null : timedOut ? 'Job exceeded its time limit; narrow the scope.' : response?.error || 'Indexing process exited unexpectedly.', new Date().toISOString(), row.id);
      }
      pumping = false;
      if (!closing) setImmediate(pump);
    });
    // Re-resolve registry on replay. Removed repositories do not get resumed.
    const payload = JSON.parse(row.payload), registered = repositories[payload.request.repository];
    if (!registered || registered.config.repository_id !== payload.config.repository_id || registered.config.workspace_id !== payload.config.workspace_id || fingerprint(registered.config.scope) !== payload.registered_scope || (!allowEmbeddings && ((payload.request.embed && payload.request.operation !== 'plan') || payload.request.semantic))) {
      response = { ok: false, error: 'Repository registration changed; resubmit this job.' }; child.kill(); return;
    }
    child.send({ ...payload, root: registered.root, filename: path.join(stateDir, 'knowledge.sqlite'), maxFiles });
  };
  const secret = Buffer.from(token);
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const route = new URL(req.url, 'http://local').pathname;
      if (req.method === 'GET' && route === '/healthz') return send(200, { ok: true, service: 'agentsam-knowledge', version: 1 });
      const provided = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
      if (provided.length !== secret.length || !timingSafeEqual(provided, secret)) throw fail(401, 'Unauthorized.');
      if (req.method === 'GET' && route === '/v1/repositories') return send(200, { repositories: Object.keys(repositories), embeddings_enabled: allowEmbeddings });
      if (req.method === 'GET' && /^\/v1\/jobs\/[a-f0-9-]{36}$/.test(route)) {
        const job = get(route.split('/').pop()); if (!job) throw fail(404, 'Job not found.'); return send(200, job);
      }
      if (req.method !== 'POST' || route !== '/v1/jobs') throw fail(404, 'Route not found.');
      if (closing) throw fail(503, 'Service is stopping.');
      if (!(req.headers['content-type'] || '').startsWith('application/json')) throw fail(415, 'Use application/json.');
      const payload = normalizeRequest(await readBody(req), repositories, allowEmbeddings);
      payload.registered_scope = fingerprint(repositories[payload.request.repository].config.scope);
      const key = req.headers['idempotency-key'];
      if (key !== undefined && (typeof key !== 'string' || !/^[\w:.-]{1,128}$/.test(key))) throw fail(400, 'Invalid Idempotency-Key.');
      const digest = fingerprint(payload), idem = key ? fingerprint([payload.config.workspace_id, payload.config.repository_id, key]) : null;
      const previous = idem && db.prepare('SELECT * FROM jobs WHERE idem=?').get(idem);
      if (previous) {
        if (previous.digest !== digest) throw fail(409, 'Idempotency-Key already used for a different job.');
        return send(200, decode(previous));
      }
      if (db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running')").get().n >= maxQueued) throw fail(429, 'Job queue is full; retry later with the same Idempotency-Key.');
      const id = randomUUID(), now = new Date().toISOString();
      db.prepare("INSERT INTO jobs(id,idem,digest,payload,status,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?)").run(id, idem, digest, JSON.stringify(payload), now, now);
      send(202, get(id)); setImmediate(pump);
    } catch (error) { if (!res.writableEnded) send(error.status || 500, { error: error.status ? error.message : 'Service request failed.' }); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  setImmediate(pump);
  return { server, address: server.address(), async close() {
    closing = true;
    if (child) { const active = child; await new Promise(resolve => { active.once('close', resolve); active.kill('SIGKILL'); }); }
    await new Promise(resolve => server.close(resolve)); db.close();
  } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    // Initialize the named volume, then match the host file owner before reading mounts.
    // The long-running server and all indexing children run without root privileges.
    if (process.getuid?.() === 0 && process.env.AGENTSAM_RUNTIME_UID) {
      const uid = Number(process.env.AGENTSAM_RUNTIME_UID), gid = Number(process.env.AGENTSAM_RUNTIME_GID);
      if (!Number.isInteger(uid) || uid < 0 || !Number.isInteger(gid) || gid < 0) throw new Error('Invalid runtime uid/gid.');
      const state = process.env.AGENTSAM_STATE_DIR || '/data';
      fs.mkdirSync(state, { recursive: true, mode: 0o700 }); fs.chownSync(state, uid, gid);
      process.setgroups([]); process.setgid(gid); process.setuid(uid);
    }
    const registry = JSON.parse(fs.readFileSync(process.env.AGENTSAM_REPOSITORIES_FILE || '/config/repositories.json', 'utf8'));
    const token = fs.readFileSync(process.env.AGENTSAM_SERVICE_TOKEN_FILE || '/config/service.token', 'utf8').trim();
    const service = await startKnowledgeService({ stateDir: process.env.AGENTSAM_STATE_DIR || '/data', repositories: registry,
      token, host: process.env.HOST || '0.0.0.0', port: Number(process.env.PORT || 8792), allowEmbeddings: process.env.AGENTSAM_ALLOW_EMBEDDINGS === 'true' });
    console.log(JSON.stringify({ event: 'listening', port: service.address.port, repositories: Object.keys(registry), embeddings_enabled: process.env.AGENTSAM_ALLOW_EMBEDDINGS === 'true' }));
    let stopped = false;
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { if (!stopped) { stopped = true; await service.close(); process.exit(0); } });
  } catch { console.error('Knowledge service could not start; check repository registrations, token file, and state permissions.'); process.exit(1); }
}
