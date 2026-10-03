import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalSqliteDatabase } from '../../../src/local/sqlite.js';
import { applyRuntimeMigrations } from '../../../src/local/migrations.js';
import {
  SqliteQueueAdapter,
  QueueControl,
  buildQueueTopology,
  createJobEnvelope,
} from '../src/index.js';

async function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-queue-sqlite-'));
  const db = await createLocalSqliteDatabase(path.join(dir, 'agentsam.sqlite'));
  await applyRuntimeMigrations(db);
  return { dir, db, close: () => db.close() };
}

test('SQLite adapter persists delayed work and leases due jobs without polling models', async (t) => {
  const fx = await fixture();
  t.after(fx.close);
  const topology = buildQueueTopology({ namespace: 'test', environment: 'local' });
  const adapter = new SqliteQueueAdapter({ database: fx.db, leaseOwner: 'worker-a', leaseTtlSeconds: 30 });
  const control = new QueueControl({ adapter, topology });

  const enqueued = await control.enqueue(
    { kind: 'repository.index', account_id: 'acct_1' },
    {
      account_id: 'acct_1',
      id: 'job_delayed',
      available_at: 120,
      created_at: 100,
      idempotency_key: 'idx:repo:a',
    },
  );
  const queue = enqueued.plan.physical_queue;

  assert.equal(await adapter.depth(queue), 1);
  assert.deepEqual(await adapter.pull(queue, 1, { now: 119 }), []);

  const first = await adapter.pull(queue, 1, { now: 120, owner: 'worker-a', ttl_seconds: 30 });
  assert.equal(first.length, 1);
  assert.equal(first[0].status, 'claimed');
  assert.equal(first[0].lease_owner, 'worker-a');
  assert.equal(first[0].lease_expires_at, 150);
  assert.equal(first[0].lease_generation, 1);

  assert.deepEqual(await adapter.pull(queue, 1, { now: 149, owner: 'worker-b' }), []);

  const reclaimed = await adapter.pull(queue, 1, { now: 150, owner: 'worker-b', ttl_seconds: 20 });
  assert.equal(reclaimed.length, 1);
  assert.equal(reclaimed[0].lease_owner, 'worker-b');
  assert.equal(reclaimed[0].lease_generation, 2);

  const ack = await adapter.ack(reclaimed[0], { status: 'completed', result: { indexed: 3 }, now: 151 });
  assert.equal(ack.updated, 1);
  assert.equal(await adapter.depth(queue), 0);
  assert.equal((await adapter.get('job_delayed')).status, 'completed');
});

test('SQLite adapter deduplicates stable idempotency keys across repeated enqueue attempts', async (t) => {
  const fx = await fixture();
  t.after(fx.close);
  const adapter = new SqliteQueueAdapter({ database: fx.db });
  const queue = 'agentsam-local-jobs';

  const first = createJobEnvelope({
    id: 'job_a',
    account_id: 'acct_1',
    kind: 'deployment.poll',
    idempotency_key: 'deploy:123',
    created_at: 10,
  });
  const duplicate = createJobEnvelope({
    id: 'job_b',
    account_id: 'acct_1',
    kind: 'deployment.poll',
    idempotency_key: 'deploy:123',
    created_at: 11,
  });

  assert.equal((await adapter.publish(queue, first)).accepted, 1);
  const second = await adapter.publish(queue, duplicate);
  assert.equal(second.accepted, 0);
  assert.equal(second.deduplicated, true);
  assert.equal(second.existing_job_id, 'job_a');
  assert.equal(await adapter.depth(queue), 1);
});
