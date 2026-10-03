import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalSqliteDatabase } from '../../src/local/sqlite.js';
import { applyRuntimeMigrations } from '../../src/local/migrations.js';
import { DatabaseAgentControlClient, HttpAgentControlClient } from '../../src/acp/client.js';
import { createAgentControlHttpHandler } from '../../src/acp/http.js';

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
