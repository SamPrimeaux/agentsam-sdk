import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfig } from '../../src/knowledge/config.js';
import { createKnowledgeJobEngine } from '../../src/knowledge/service/job-engine.js';
import { startKnowledgeHttpServer } from '../../src/knowledge/service/server.js';
import { startKnowledgeGrpcServer } from '../../src/knowledge/service/grpc-server.js';
import { createKnowledgeServiceClient } from '../../src/knowledge/service/client.js';
import { createKnowledgeGrpcClient } from '../../src/knowledge/service/grpc-client.js';
import { grpc } from '../../src/knowledge/service/grpc-codec.js';

const fixtureWorker = fileURLToPath(new URL('../fixtures/knowledge-rpc-worker.mjs', import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(client, id, wanted = new Set(['completed', 'failed'])) {
  for (let i = 0; i < 200; i++) {
    const job = await client.job(id);
    if (wanted.has(job.status)) return job;
    await sleep(10);
  }
  throw new Error(`Job ${id} did not reach ${[...wanted].join('/')}.`);
}

async function collect(stream) {
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
}

test('knowledge HTTP and gRPC adapters share auth, validation, idempotency, lifecycle, cancellation, and durable jobs', async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-rpc-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const root = path.join(tmp, 'repo');
  const stateDir = path.join(tmp, 'state');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'sample.js'), 'export const sample = true;\n');
  const config = defaultConfig({ include: ['src'] });
  const repositories = { sample: { root, config } };
  const token = 'r'.repeat(64);
  const engine = createKnowledgeJobEngine({ stateDir, repositories, workerPath: fixtureWorker, jobTimeoutMs: 2_000 });
  const http = await startKnowledgeHttpServer({ engine, token, port: 0 });
  const rpcServer = await startKnowledgeGrpcServer({ engine, token, port: 0 });
  const httpClient = createKnowledgeServiceClient({ baseUrl: `http://127.0.0.1:${http.address.port}`, token });
  const rpc = createKnowledgeGrpcClient({ target: rpcServer.target, token });
  const unauthorized = createKnowledgeGrpcClient({ target: rpcServer.target, token: 'x'.repeat(64) });
  t.after(async () => {
    unauthorized.close();
    rpc.close();
    await rpcServer.close();
    await http.close();
    await engine.close();
  });

  const repos = await rpc.repositories();
  assert.deepEqual(repos.repositories, ['sample']);
  assert.equal(repos.repository_details[0].repository_id, config.repository_id);
  assert.equal(repos.embeddings_enabled, false);
  await assert.rejects(unauthorized.repositories(), error => error.status === 401 && error.grpcCode === grpc.status.UNAUTHENTICATED);
  await assert.rejects(
    rpc.submit({ repository: 'sample', operation: 'bogus' }),
    error => error.status === 400 && error.grpcCode === grpc.status.INVALID_ARGUMENT,
  );

  const request = { repository: 'sample', operation: 'index', generation_id: 'equivalent' };
  const fromHttp = await httpClient.submit(request, 'cross-transport');
  const fromGrpc = await rpc.submit(request, 'cross-transport');
  assert.equal(fromGrpc.id, fromHttp.id);
  await assert.rejects(
    rpc.submit({ ...request, scope: 'different' }, 'cross-transport'),
    error => error.status === 409 && error.grpcCode === grpc.status.ABORTED,
  );
  const completed = await waitFor(rpc, fromGrpc.id);
  assert.equal(completed.status, 'completed');
  assert.equal((await httpClient.job(fromGrpc.id)).result.repository_id, completed.result.repository_id);

  const blocker = await rpc.submit({ repository: 'sample', operation: 'index', generation_id: 'slow' }, 'blocker');
  await waitFor(rpc, blocker.id, new Set(['running']));
  const watched = await rpc.submit({ repository: 'sample', operation: 'index', generation_id: 'watch' }, 'watched');
  const lifecycle = await collect(rpc.watch(watched.id));
  assert.deepEqual(lifecycle.map(event => event.job.status), ['queued', 'running', 'completed']);
  assert.deepEqual(lifecycle.map(event => event.sequence), [1, 2, 3]);

  const failed = await rpc.submit({ repository: 'sample', operation: 'index', generation_id: 'fail' }, 'failed');
  const failureEvents = await collect(rpc.watch(failed.id));
  assert.equal(failureEvents.at(-1).job.status, 'failed');
  assert.match(failureEvents.at(-1).job.error, /fixture knowledge failure/);

  const cancellable = await rpc.submit({ repository: 'sample', operation: 'index', generation_id: 'slow' }, 'cancel-watch');
  const controller = new AbortController();
  const iterator = rpc.watch(cancellable.id, { signal: controller.signal })[Symbol.asyncIterator]();
  const first = await iterator.next();
  assert.equal(first.done, false);
  controller.abort();
  const afterAbort = await iterator.next();
  assert.equal(afterAbort.done, true);
  assert.equal((await waitFor(rpc, cancellable.id)).status, 'completed');

  const deadlineJob = await rpc.submit({ repository: 'sample', operation: 'index', generation_id: 'slow' }, 'deadline-watch');
  let deadlineError = null;
  try {
    await collect(rpc.watch(deadlineJob.id, { timeoutMs: 15 }));
  } catch (error) {
    deadlineError = error;
  }
  assert.ok(deadlineError);
  assert.equal(deadlineError.grpcCode, grpc.status.DEADLINE_EXCEEDED);
  assert.equal(deadlineError.status, 504);
  assert.equal((await waitFor(rpc, deadlineJob.id)).status, 'completed');
});
