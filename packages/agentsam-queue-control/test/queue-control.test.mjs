import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QueueControl,
  MemoryQueueAdapter,
  buildQueueTopology,
  resolvePhysicalQueue,
  routeWork,
} from '../src/index.js';

test('compact topology routes logical workloads onto one durable queue plus DLQ', () => {
  const topology = buildQueueTopology({
    namespace: 'demo',
    environment: 'test',
    mode: 'compact',
  });

  assert.equal(resolvePhysicalQueue(topology, 'cad'), 'demo-test-jobs');
  assert.equal(resolvePhysicalQueue(topology, 'cms'), 'demo-test-jobs');
  assert.equal(resolvePhysicalQueue(topology, 'dead_letter'), 'demo-test-dlq');
});

test('segmented topology gives heavy workload lanes independent physical queues', () => {
  const topology = buildQueueTopology({
    namespace: 'demo',
    environment: 'prod',
    mode: 'segmented',
  });

  assert.notEqual(resolvePhysicalQueue(topology, 'cad'), resolvePhysicalQueue(topology, 'cms'));
  assert.equal(resolvePhysicalQueue(topology, 'batch_ai'), 'demo-prod-ai');
});

test('routing sends deferred independent OpenAI work to provider batch', () => {
  const plan = routeWork({
    kind: 'code.classify',
    ai_provider: 'openai',
    estimated_ai_calls: 500,
    independent_items: true,
    latency: 'background',
  });

  assert.equal(plan.logical_queue, 'batch_ai');
  assert.equal(plan.executor, 'openai_batch');
});

test('queue control publishes provider-neutral job envelopes and dispatches multiple job kinds', async () => {
  const adapter = new MemoryQueueAdapter();
  const control = new QueueControl({
    adapter,
    topology: buildQueueTopology({ namespace: 'demo', environment: 'test' }),
  });

  control
    .register('cad.*', async (job) => ({ built: job.payload.part }))
    .register('cms.*', async (job) => ({ saved: job.payload.entry }));

  const first = await control.enqueue({
    account_id: 'acct_real',
    kind: 'cad.generate',
    payload: { part: 'bracket' },
  });
  const second = await control.enqueue({
    account_id: 'acct_real',
    kind: 'cms.publish',
    payload: { entry: 'home' },
  });

  assert.equal(first.published, true);
  assert.equal(second.published, true);

  const queue = resolvePhysicalQueue(control.topology, 'cad');
  const jobs = await adapter.pull(queue, 10);
  const results = await control.consume(jobs);

  assert.equal(results.length, 2);
  assert.deepEqual(results[0].result, { built: 'bracket' });
  assert.deepEqual(results[1].result, { saved: 'home' });
});

test('infrastructure provisioning is approval-gated by default', async () => {
  const adapter = new MemoryQueueAdapter();
  const control = new QueueControl({
    adapter,
    topology: buildQueueTopology({ namespace: 'demo', environment: 'test' }),
  });

  await assert.rejects(() => control.provision(), /approval_required/);

  const allowed = new QueueControl({
    adapter,
    topology: control.topology,
    approval: async () => true,
  });

  const result = await allowed.provision();
  assert.equal(result.provider, 'memory');
  assert.ok(result.created.includes('demo-test-jobs'));
});
