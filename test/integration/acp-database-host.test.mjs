import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalSqliteDatabase } from '../../src/local/sqlite.js';
import { applyRuntimeMigrations } from '../../src/local/migrations.js';
import { DatabaseAgentControlClient, HttpAgentControlClient } from '../../src/acp/client.js';
import { createAgentControlHttpHandler } from '../../src/acp/http.js';
import { handleAgentControlRequest } from '../../apps/local-studio/backend/worker/agent-control-service.js';
import { createAgentRunJobHandler } from '../../src/acp/agent-executor.js';

test('D1-shaped database control adapter hosts the same ACP contract without local filesystem authority', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-acp-database-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const db = await createLocalSqliteDatabase(path.join(dir, 'host.sqlite'));
  t.after(() => db.close());
  await applyRuntimeMigrations(db);

  const databaseControl = new DatabaseAgentControlClient({ database: db, kind: 'database-test' });
  const handler = createAgentControlHttpHandler({ control: databaseControl });
  const client = new HttpAgentControlClient({
    baseUrl: 'https://host.example.test',
    fetchImpl: (url, init = {}) => handler(new Request(url, init)),
  });

  const root = await client.start({
    objective: 'Coordinate through a D1-shaped host',
    role: 'lead',
    runtime_requirements: {
      capabilities: ['exec', 'filesystem'],
      preferred_providers: ['google_cloud', 'cloudflare', 'local'],
    },
  });
  assert.equal(root.status, 'queued');

  const child = await client.spawn(root.run_id, {
    objective: 'Perform one child operation',
    role: 'worker',
    runtime_requirements: { capabilities: ['exec'] },
  });
  assert.equal(child.parent_run_id, root.run_id);

  const tree = await client.tree(root.run_id);
  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0].id, child.child_run_id);
  assert.equal(tree.status, 'waiting_child');

  const events = await client.events(root.run_id);
  assert.deepEqual(events.map((event) => event.eventType), [
    'run.created',
    'run.queued',
    'run.suspended',
  ]);

  const queueRows = await db.prepare(
    "SELECT kind, source_run_id, job_json FROM agentsam_queue_job ORDER BY created_at_unix, id"
  ).all();
  assert.deepEqual(queueRows.results.map((row) => row.kind), ['agent.run', 'agent.run']);
  assert.deepEqual(
    queueRows.results.map((row) => row.source_run_id).sort(),
    [root.run_id, child.child_run_id].sort(),
  );
});


test('hosted D1 control route scopes runs to the authenticated account and writes timeout analytics', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-acp-d1-host-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const db = await createLocalSqliteDatabase(path.join(dir, 'host.sqlite'));
  t.after(() => db.close());
  await applyRuntimeMigrations(db);
  const env = { DB: db };

  const created = await handleAgentControlRequest(new Request(
    'https://host.example.test/api/agent-control/v1/runs',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ objective: 'Hosted account-scoped run', role: 'lead' }),
    },
  ), env, 'acct_hosted');
  assert.equal(created.status, 202);
  const start = await created.json();
  assert.equal(start.status, 'queued');

  const timeoutRequest = () => new Request(
    `https://host.example.test/api/agent-control/v1/runs/${start.run_id}/timeout`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error_code: 'run_timeout',
        error_message: 'Hosted run exceeded its deadline',
        created_at_unix: 200,
      }),
    },
  );
  const timedOutResponse = await handleAgentControlRequest(timeoutRequest(), env, 'acct_hosted');
  assert.equal(timedOutResponse.status, 202);
  const timedOut = await timedOutResponse.json();
  assert.equal(timedOut.status, 'timed_out');
  assert.equal(timedOut.storageStatus, 'failed');
  assert.equal(timedOut.analytics.basin.skipped, 'binding_unavailable');

  const persisted = await db.prepare(
    'SELECT status, error_code FROM agentsam_agent_run WHERE id = ?'
  ).bind(start.run_id).first();
  assert.equal(persisted.status, 'failed');
  assert.equal(persisted.error_code, 'run_timeout');

  const fact = await db.prepare(
    'SELECT event_kind, domain, operation, outcome, run_id, dedup_key FROM agentsam_analytics WHERE run_id = ?'
  ).bind(start.run_id).first();
  assert.equal(fact.event_kind, 'runtime');
  assert.equal(fact.domain, 'agent_run');
  assert.equal(fact.operation, 'timeout');
  assert.equal(fact.outcome, 'timed_out');
  assert.equal(fact.dedup_key, `run:${start.run_id}:timed_out`);

  const repeatedResponse = await handleAgentControlRequest(timeoutRequest(), env, 'acct_hosted');
  const repeated = await repeatedResponse.json();
  assert.equal(repeated.timeoutRecorded, false);
  assert.equal(repeated.analytics.deduplicated, true);
  const factCount = await db.prepare(
    'SELECT COUNT(*) AS count FROM agentsam_analytics WHERE run_id = ?'
  ).bind(start.run_id).first();
  assert.equal(factCount.count, 1);

  const foreignRun = await handleAgentControlRequest(new Request(
    `https://host.example.test/api/agent-control/v1/runs/${start.run_id}`,
  ), env, 'acct_other');
  assert.equal(foreignRun.status, 404);
});


test('agent.run timeout errors invoke the configured hosted timeout persistence', async () => {
  const calls = [];
  const handle = createAgentRunJobHandler({
    execute: async () => {
      throw Object.assign(new Error('Provider deadline exceeded'), { code: 'ETIMEDOUT' });
    },
    agentControlClient: {
      async timeout(runId, input) { calls.push({ runId, input }); },
    },
  });
  await assert.rejects(
    handle({
      id: 'job_timeout',
      kind: 'agent.run',
      source_run_id: 'arun_timeout',
      payload: { run_id: 'arun_timeout' },
    }),
    (error) => error.code === 'ETIMEDOUT',
  );
  assert.deepEqual(calls, [{
    runId: 'arun_timeout',
    input: {
      error_code: 'ETIMEDOUT',
      error_message: 'Provider deadline exceeded',
    },
  }]);
});
