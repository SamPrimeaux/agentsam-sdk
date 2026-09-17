import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBearerTokenVerifier } from './auth.js';
import { createKnowledgeJobEngine, serviceError } from './job-engine.js';

async function readBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 16384) throw serviceError(413, 'Job body exceeds 16 KiB.', 'RESOURCE_EXHAUSTED');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw serviceError(400, 'Invalid JSON.', 'INVALID_ARGUMENT'); }
}

export async function startKnowledgeHttpServer({ engine, token, verifyToken, port = 8792, host = '127.0.0.1' } = {}) {
  if (!engine) throw new Error('Knowledge job engine is required.');
  const verify = verifyToken || createBearerTokenVerifier(token);
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const route = new URL(req.url, 'http://local').pathname;
      if (req.method === 'GET' && route === '/healthz') return send(200, { ok: true, service: 'agentsam-knowledge', version: 1 });
      if (!verify(req.headers.authorization)) throw serviceError(401, 'Unauthorized.', 'UNAUTHENTICATED');
      if (req.method === 'GET' && route === '/v1/repositories') {
        const value = engine.listRepositories();
        return send(200, { repositories: value.repositories.map(repo => repo.alias), embeddings_enabled: value.embeddings_enabled });
      }
      if (req.method === 'GET' && /^\/v1\/jobs\/[a-f0-9-]{36}$/.test(route)) return send(200, engine.getJob(route.split('/').pop()));
      if (req.method !== 'POST' || route !== '/v1/jobs') throw serviceError(404, 'Route not found.', 'NOT_FOUND');
      if (!(req.headers['content-type'] || '').startsWith('application/json')) throw serviceError(415, 'Use application/json.', 'INVALID_ARGUMENT');
      const { job, created } = engine.submitJob(await readBody(req), { idempotencyKey: req.headers['idempotency-key'] });
      return send(created ? 202 : 200, job);
    } catch (error) {
      if (!res.writableEnded) send(error.status || 500, { error: error.status ? error.message : 'Service request failed.' });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return { server, address: server.address(), async close() { await new Promise(resolve => server.close(resolve)); } };
}

export async function startKnowledgeService({ token, port = 8792, host = '127.0.0.1', ...engineOptions } = {}) {
  const verifyToken = createBearerTokenVerifier(token);
  const engine = createKnowledgeJobEngine(engineOptions);
  try {
    const httpService = await startKnowledgeHttpServer({ engine, verifyToken, port, host });
    return { ...httpService, engine, async close() { await httpService.close(); await engine.close(); } };
  } catch (error) {
    await engine.close();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.getuid?.() === 0 && process.env.AGENTSAM_RUNTIME_UID) {
      const uid = Number(process.env.AGENTSAM_RUNTIME_UID), gid = Number(process.env.AGENTSAM_RUNTIME_GID);
      if (!Number.isInteger(uid) || uid < 0 || !Number.isInteger(gid) || gid < 0) throw new Error('Invalid runtime uid/gid.');
      const state = process.env.AGENTSAM_STATE_DIR || '/data';
      fs.mkdirSync(state, { recursive: true, mode: 0o700 }); fs.chownSync(state, uid, gid);
      process.setgroups([]); process.setgid(gid); process.setuid(uid);
    }
    const registry = JSON.parse(fs.readFileSync(process.env.AGENTSAM_REPOSITORIES_FILE || '/config/repositories.json', 'utf8'));
    const token = fs.readFileSync(process.env.AGENTSAM_SERVICE_TOKEN_FILE || '/config/service.token', 'utf8').trim();
    const service = await startKnowledgeService({ stateDir: process.env.AGENTSAM_STATE_DIR || '/data', repositories: registry, token, host: process.env.HOST || '0.0.0.0', port: Number(process.env.PORT || 8792), allowEmbeddings: process.env.AGENTSAM_ALLOW_EMBEDDINGS === 'true' });
    console.log(JSON.stringify({ event: 'listening', port: service.address.port, repositories: Object.keys(registry), embeddings_enabled: process.env.AGENTSAM_ALLOW_EMBEDDINGS === 'true' }));
    let stopped = false;
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { if (!stopped) { stopped = true; await service.close(); process.exit(0); } });
  } catch {
    console.error('Knowledge service could not start; check repository registrations, token file, and state permissions.');
    process.exit(1);
  }
}
