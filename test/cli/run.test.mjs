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
