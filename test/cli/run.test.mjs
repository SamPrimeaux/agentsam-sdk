import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalSqliteDatabase } from '../../src/local/sqlite.js';
import { applyRuntimeMigrations } from '../../src/local/migrations.js';
import { runtimeDatabasePath } from '../../src/local/runtime-store.js';
import {
  LocalAgentControlClient,
  HttpAgentControlClient,
  createAgentControlClient,
} from '../../src/acp/client.js';
import { runRun } from '../../src/commands/run.js';

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-acp-run-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"acp-test","private":true}\n');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const db = await createLocalSqliteDatabase(runtimeDatabasePath(root));
  await applyRuntimeMigrations(db);
  await db.prepare(`
    INSERT INTO agentsam_agent_run (
      id, account_id, source_client, surface, mode, status,
      model_key, model_call_count, tool_call_count, cost_usd,
      started_at_unix, updated_at_unix
    ) VALUES (?, ?, 'test', 'cli', 'multitask', 'running', 'test-model', 2, 3, 0.0125, 100, 100)
  `).bind('arun_parent', 'acct_1').run();
  await db.prepare(`
    INSERT INTO agentsam_agent_run (
      id, account_id, parent_run_id, source_client, surface, mode, status,
      started_at_unix, updated_at_unix
    ) VALUES (?, ?, ?, 'test', 'cli', 'agent', 'running', 101, 101)
  `).bind('arun_child', 'acct_1', 'arun_parent').run();
  await db.prepare(`
    INSERT INTO agentsam_agent_run_event (
      event_id, run_id, seq, event_type, phase, label, evidence_json, created_at_unix
    ) VALUES (?, ?, 0, 'run.started', 'boot', 'Parent started', '{}', 100)
  `).bind('evt_parent_0', 'arun_parent').run();
  await db.prepare(`
    INSERT INTO agentsam_agent_run_event (
      event_id, run_id, parent_run_id, seq, event_type, phase, label, evidence_json, created_at_unix
    ) VALUES (?, ?, ?, 0, 'run.started', 'boot', 'Child started', '{}', 101)
  `).bind('evt_child_0', 'arun_child', 'arun_parent').run();
  db.close();
  return root;
}

test('local ACP client reads run/tree/events, requests cancel, and projects receipt', async (t) => {
  const root = await fixture(t);
  const client = new LocalAgentControlClient({ cwd: root });

  const run = await client.getRun('arun_parent');
  assert.equal(run.schema, 'agentsam.run.v1');
  assert.equal(run.status, 'running');
  assert.equal(run.modelCallCount, 2);

  const tree = await client.tree('arun_parent');
  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0].id, 'arun_child');

  const before = await client.events('arun_child');
  assert.deepEqual(before.map((event) => event.eventType), ['run.started']);

  const cancelled = await client.cancel('arun_child');
  assert.equal(cancelled.cancelRequested, true);
  assert.equal(cancelled.cancelAccepted, true);

  const after = await client.events('arun_child');
  assert.deepEqual(after.map((event) => event.eventType), ['run.started', 'run.cancel_requested']);

  const receipt = await client.receipt('arun_parent');
  assert.equal(receipt.schema, 'agentsam.run-receipt.v1');
  assert.equal(receipt.childRunCount, 1);
  assert.equal(receipt.eventCount, 1);
  assert.equal(receipt.usage.costUsd, 0.0125);
});

test('agentsam run CLI uses local ACP by default and watch --once reads events without a model call', async (t) => {
  const root = await fixture(t);
  const output = [];
  const tree = await runRun(['tree', 'arun_parent', '--json'], {
    cwd: root,
    write: (value) => output.push(String(value)),
  });
  assert.equal(tree.children[0].id, 'arun_child');
  assert.equal(JSON.parse(output.join('')).id, 'arun_parent');

  const watched = [];
  const result = await runRun(['watch', 'arun_parent', '--once', '--json'], {
    cwd: root,
    write: (value) => watched.push(String(value)),
    sleep: async () => { throw new Error('watch --once must not sleep'); },
  });
  assert.equal(result.events.length, 1);
  assert.equal(JSON.parse(watched[0]).eventType, 'run.started');
});

test('HTTP ACP client is provider-neutral and carries bearer auth to a compatible host', async () => {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init });
    if (url.endsWith('/v1/runs/arun_remote')) {
      return Response.json({ schema: 'agentsam.run.v1', id: 'arun_remote', status: 'running' });
    }
    if (url.includes('/events?')) return Response.json([]);
    if (url.endsWith('/tree')) return Response.json({ id: 'arun_remote', status: 'running', children: [] });
    if (url.endsWith('/spawn')) return Response.json({ schema: 'agentsam.child-run-spawn.v1', parent_run_id: 'arun_remote', child_run_id: 'arun_child_remote', dependency_status: 'pending' });
    if (url.endsWith('/cancel')) return Response.json({ id: 'arun_remote', status: 'running', cancelRequested: true });
    if (url.endsWith('/receipt')) return Response.json({ schema: 'agentsam.run-receipt.v1', runId: 'arun_remote', status: 'running' });
    return new Response('not found', { status: 404 });
  };
  const client = new HttpAgentControlClient({
    baseUrl: 'https://control.example.test/',
    token: 'secret-token',
    fetchImpl,
  });
  assert.equal((await client.getRun('arun_remote')).id, 'arun_remote');
  await client.events('arun_remote', { after: 4, limit: 12 });
  await client.tree('arun_remote');
  const spawned = await client.spawn('arun_remote', { objective: 'delegate', runtime_requirements: { capabilities: ['exec'] } });
  assert.equal(spawned.child_run_id, 'arun_child_remote');
  await client.cancel('arun_remote');
  await client.receipt('arun_remote');

  assert.equal(requests.length, 6);
  assert.equal(new Headers(requests[0].init.headers).get('authorization'), 'Bearer secret-token');
  assert.match(requests[1].url, /after=4&limit=12$/);
  assert.equal(requests[3].init.method, 'POST');
  assert.match(requests[3].url, /\/spawn$/);
  assert.deepEqual(JSON.parse(requests[3].init.body).runtime_requirements, { capabilities: ['exec'] });
  assert.equal(requests[4].init.method, 'POST');

  const resolved = createAgentControlClient({
    cwd: process.cwd(),
    url: 'https://control.example.test',
    token: 'secret-token',
    fetchImpl,
  });
  assert.equal(resolved.kind, 'http');
});

test('agentsam run start creates a queued provider-neutral root run without invoking a model', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-acp-start-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"acp-start-test","private":true}\n');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const output = [];
  const started = await runRun([
    'start',
    '--objective', 'Audit and package this repository',
    '--role', 'lead',
    '--model', 'provider/model',
    '--runtime-json', '{"capabilities":["filesystem","exec"]}',
    '--json',
  ], {
    cwd: root,
    write: (value) => output.push(String(value)),
  });

  assert.equal(started.schema, 'agentsam.run-start.v1');
  assert.match(started.run_id, /^arun_/);
  assert.equal(started.status, 'queued');
  assert.equal(started.queue_job.kind, 'agent.run');
  assert.equal(started.queue_job.source_run_id, started.run_id);
  assert.equal(started.queue_job.payload.parent_run_id, null);
  assert.equal(started.queue_job.payload.role, 'lead');
  assert.deepEqual(started.queue_job.payload.runtime_requirements, { capabilities: ['filesystem', 'exec'] });

  const client = new LocalAgentControlClient({ cwd: root });
  const run = await client.getRun(started.run_id);
  assert.equal(run.status, 'queued');
  assert.equal(run.parentRunId, undefined);
  assert.equal(run.modelKey, 'provider/model');
  assert.equal(run.modelCallCount, 0);
  assert.equal(run.toolCallCount, 0);

  const events = await client.events(started.run_id);
  assert.deepEqual(events.map((event) => event.eventType), ['run.created', 'run.queued']);
  assert.equal(JSON.parse(output.join('')).run_id, started.run_id);

  const db = await createLocalSqliteDatabase(runtimeDatabasePath(root));
  try {
    await applyRuntimeMigrations(db);
    const rows = await db.prepare(
      "SELECT kind, status, job_json FROM agentsam_queue_job WHERE source_run_id = ? ORDER BY created_at_unix"
    ).bind(started.run_id).all();
    assert.equal(rows.results.length, 1);
    assert.equal(rows.results[0].kind, 'agent.run');
    assert.equal(rows.results[0].status, 'queued');
    assert.equal(JSON.parse(rows.results[0].job_json).idempotency_key, 'agent-run:' + started.run_id);
  } finally {
    db.close();
  }
});

test('HTTP ACP start uses the same POST /v1/runs contract as any hosted provider', async () => {
  const requests = [];
  const client = new HttpAgentControlClient({
    baseUrl: 'https://provider.example.test',
    token: 'provider-token',
    fetchImpl: async (url, init = {}) => {
      requests.push({ url, init });
      return Response.json({
        schema: 'agentsam.run-start.v1',
        run_id: 'arun_remote_root',
        status: 'queued',
        queue: 'provider-managed',
      });
    },
  });

  const started = await client.start({
    objective: 'Run on any compatible host',
    role: 'lead',
    runtime_requirements: { capabilities: ['exec'] },
  });

  assert.equal(started.run_id, 'arun_remote_root');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://provider.example.test/v1/runs');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(new Headers(requests[0].init.headers).get('authorization'), 'Bearer provider-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    objective: 'Run on any compatible host',
    role: 'lead',
    runtime_requirements: { capabilities: ['exec'] },
  });
});
