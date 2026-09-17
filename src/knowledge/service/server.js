import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createKnowledgeServiceDomain, knowledgeFail } from './domain.js';

async function readBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 16384) throw knowledgeFail(413, 'Job body exceeds 16 KiB.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw knowledgeFail(400, 'Invalid JSON.'); }
}

function authorized(headers, secret) {
  const provided = Buffer.from((headers.authorization || '').replace(/^Bearer /, ''));
  return provided.length === secret.length && timingSafeEqual(provided, secret);
}

/** Trusted backend HTTP API. The calling host must authorize its user before submitting jobs. */
export async function startKnowledgeService({
  stateDir,
  repositories,
  token,
  port = 8792,
  host = '127.0.0.1',
  allowEmbeddings = false,
  maxQueued = 32,
  maxFiles = 2000,
  jobTimeoutMs = 600000,
} = {}) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 256) throw new Error('Service token must be 32..256 characters.');
  const domain = createKnowledgeServiceDomain({ stateDir, repositories, allowEmbeddings, maxQueued, maxFiles, jobTimeoutMs });
  const secret = Buffer.from(token);
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    try {
      const route = new URL(req.url, 'http://local').pathname;
      if (req.method === 'GET' && route === '/healthz') return send(200, { ok: true, service: 'agentsam-knowledge', version: 1 });
      if (!authorized(req.headers, secret)) throw knowledgeFail(401, 'Unauthorized.');
      if (req.method === 'GET' && route === '/v1/repositories') return send(200, domain.listRepositories());
      if (req.method === 'GET' && /^\/v1\/jobs\/[a-f0-9-]{36}$/.test(route)) return send(200, domain.getJob(route.split('/').pop()));
      if (req.method !== 'POST' || route !== '/v1/jobs') throw knowledgeFail(404, 'Route not found.');
      if (!(req.headers['content-type'] || '').startsWith('application/json')) throw knowledgeFail(415, 'Use application/json.');
      const job = domain.submitJob(await readBody(req), req.headers['idempotency-key']);
      return send(job.status === 'queued' ? 202 : 200, job);
    } catch (error) {
      if (!res.writableEnded) send(error.status || 500, { error: error.status ? error.message : 'Service request failed.' });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  } catch (error) {
    await domain.close();
    throw error;
  }
  return {
    server,
    domain,
    address: server.address(),
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await domain.close();
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.getuid?.() === 0 && process.env.AGENTSAM_RUNTIME_UID) {
      const uid = Number(process.env.AGENTSAM_RUNTIME_UID);
      const gid = Number(process.env.AGENTSAM_RUNTIME_GID);
      if (!Number.isInteger(uid) || uid < 0 || !Number.isInteger(gid) || gid < 0) throw new Error('Invalid runtime uid/gid.');
      const state = process.env.AGENTSAM_STATE_DIR || '/data';
      fs.mkdirSync(state, { recursive: true, mode: 0o700 });
      fs.chownSync(state, uid, gid);
      process.setgroups([]);
      process.setgid(gid);
      process.setuid(uid);
    }
    const registry = JSON.parse(fs.readFileSync(process.env.AGENTSAM_REPOSITORIES_FILE || '/config/repositories.json', 'utf8'));
    const token = fs.readFileSync(process.env.AGENTSAM_SERVICE_TOKEN_FILE || '/config/service.token', 'utf8').trim();
    const service = await startKnowledgeService({
      stateDir: process.env.AGENTSAM_STATE_DIR || '/data',
      repositories: registry,
      token,
      host: process.env.HOST || '0.0.0.0',
      port: Number(process.env.PORT || 8792),
      allowEmbeddings: process.env.AGENTSAM_ALLOW_EMBEDDINGS === 'true',
    });
    console.log(JSON.stringify({ event: 'listening', port: service.address.port, repositories: Object.keys(registry), embeddings_enabled: process.env.AGENTSAM_ALLOW_EMBEDDINGS === 'true' }));
    let stopped = false;
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
      if (!stopped) {
        stopped = true;
        await service.close();
        process.exit(0);
      }
    });
  } catch {
    console.error('Knowledge service could not start; check repository registrations, token file, and state permissions.');
    process.exit(1);
  }
}
