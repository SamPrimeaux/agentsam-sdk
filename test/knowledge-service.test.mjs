import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaultConfig } from '../src/knowledge/config.js';
import { startKnowledgeService } from '../src/knowledge/service/server.js';
import { createKnowledgeServiceClient } from '../src/knowledge/service/client.js';
import { dockerize } from '../src/lib/dockerize.js';

async function completed(client, id) {
  for (let i = 0; i < 200; i++) {
    const job = await client.job(id);
    if (['completed', 'failed'].includes(job.status)) { assert.equal(job.status, 'completed', job.error); return job; }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Job did not complete.');
}

test('service isolates scopes, authenticates, deduplicates, indexes, searches, and preserves restart state', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-service-'));
  const root = path.join(tmp, 'repo'), stateDir = path.join(tmp, 'state');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/math.ts'), 'export function add(a: number,b: number) { return a+b; }\n');
  fs.writeFileSync(path.join(root, '.env.json'), '{"password":"must-not-index"}');
  const before = fs.readFileSync(path.join(root, 'src/math.ts'), 'utf8');
  const token = 't'.repeat(64), repositories = { sample: { root, config: defaultConfig({ include: ['src'] }) } };
  let service;
  try {
    service = await startKnowledgeService({ stateDir, repositories, token, port: 0 });
    let baseUrl = `http://127.0.0.1:${service.address.port}`;
    let client = createKnowledgeServiceClient({ baseUrl, token });
    assert.equal((await fetch(baseUrl + '/healthz')).status, 200);
    assert.equal((await fetch(baseUrl + '/v1/repositories')).status, 401);
    await assert.rejects(client.submit({ repository: 'missing', operation: 'index' }), e => e.status === 404);
    await assert.rejects(client.submit({ repository: 'sample', operation: 'index', include: ['.'] }), e => e.status === 403);
    await assert.rejects(client.submit({ repository: 'sample', operation: 'index', include: ['../'] }), e => e.status === 400);
    await assert.rejects(client.submit({ repository: 'sample', operation: 'index', embed: true }), e => e.status === 403);
    const request = { repository: 'sample', operation: 'index' };
    const submitted = await client.submit(request, 'first');
    assert.equal((await client.submit(request, 'first')).id, submitted.id);
    await assert.rejects(client.submit({ ...request, scope: 'other' }, 'first'), e => e.status === 409);
    const first = await completed(client, submitted.id);
    assert.equal(first.result.files, 1); assert.equal(first.result.embedding_inputs, 0);
    assert.equal(first.result.published, true);
    const second = await completed(client, (await client.submit(request)).id);
    assert.equal(second.result.no_change, true); assert.equal(second.result.parsed_files, 0);
    assert.equal(second.result.generation_id, first.result.generation_id);
    const search = await completed(client, (await client.submit({ repository: 'sample', operation: 'search', query: 'add' })).id);
    assert.match(JSON.stringify(search.result), /src\/math.ts/);
    const plan = await completed(client, (await client.submit({ repository: 'sample', operation: 'plan', embed: true })).id);
    assert.ok(plan.result.embedding_inputs > 0); // Costs can be estimated without credentials.
    await service.close(); service = null;
    // Simulate an interrupted persisted job, as happens on SIGKILL/power loss.
    const db = new DatabaseSync(path.join(stateDir, 'jobs.sqlite'));
    db.prepare("UPDATE jobs SET status='running',result=NULL,attempts=1 WHERE id=?").run(second.id); db.close();
    service = await startKnowledgeService({ stateDir, repositories, token, port: 0 });
    baseUrl = `http://127.0.0.1:${service.address.port}`;
    client = createKnowledgeServiceClient({ baseUrl, token });
    assert.equal((await client.job(first.id)).result.generation_id, first.result.generation_id);
    const recovered = await completed(client, second.id);
    assert.equal(recovered.attempts, 2); assert.equal(recovered.result.no_change, true);
    assert.equal(fs.readFileSync(path.join(root, 'src/math.ts'), 'utf8'), before);
    assert.equal(fs.existsSync(path.join(root, '.agentsam')), false);
  } finally { await service?.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('portable dockerize stages only SDK runtime, preserves identities/tokens, and generates persistent loopback config', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-service-docker-'));
  const root = path.join(tmp, 'customer'); fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'customer-secret.js'), 'must not enter build context');
  try {
    const options = { appSlug: 'knowledge-test', repositories: [`customer=${root}`], writeOnly: true };
    const result = await dockerize(tmp, 'knowledge_service', options);
    assert.match(result.plan.files.compose, /127\.0\.0\.1:8792:8792/);
    assert.match(result.plan.files.compose, /unless-stopped/);
    assert.match(result.plan.files.compose, /"read_only":true/);
    const context = path.join(result.written.versionDir, 'context');
    assert.equal(fs.existsSync(path.join(context, 'customer-secret.js')), false);
    assert.equal(fs.existsSync(path.join(context, 'src/knowledge/service/server.js')), true);
    assert.equal(fs.existsSync(path.join(context, 'package-lock.json')), true);
    const token = fs.readFileSync(result.tokenFile, 'utf8');
    assert.equal(fs.statSync(result.tokenFile).mode & 0o777, 0o600);
    assert.ok(!JSON.stringify(result.plan).includes(token.trim()));
    const registry = fs.readFileSync(path.join(result.configurationDir, 'repositories.json'), 'utf8');
    await dockerize(tmp, 'knowledge_service', options);
    assert.equal(fs.readFileSync(result.tokenFile, 'utf8'), token);
    assert.equal(fs.readFileSync(path.join(result.configurationDir, 'repositories.json'), 'utf8'), registry);
    await assert.rejects(dockerize(tmp, 'knowledge_service', { ...options, timeoutSeconds: 2 }), /persistent/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
