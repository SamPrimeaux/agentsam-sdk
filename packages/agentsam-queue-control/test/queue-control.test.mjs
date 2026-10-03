import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QueueControl,
  MemoryQueueAdapter,
  CloudflareQueueBindingAdapter,
  CloudflareQueueApiAdapter,
  canClaimJobLease,
  claimJobLease,
  computeRetryDelayMs,
  createJobEnvelope,
  createRetrySchedule,
  delaySecondsForAvailableAt,
  jobExecutionIdentity,
  refreshJobLease,
  releaseJobLease,
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


test('job envelopes support delayed availability without making early work runnable', async () => {
  const adapter = new MemoryQueueAdapter();
  const control = new QueueControl({
    adapter,
    topology: buildQueueTopology({ namespace: 'demo', environment: 'test' }),
  });
  const queue = resolvePhysicalQueue(control.topology, 'deployments');
  const createdAt = 1_000;
  const availableAt = 1_060;
  const result = await control.enqueue({
    account_id: 'acct_real',
    kind: 'deploy.cloudflare',
  }, {
    created_at: createdAt,
    availableAt,
  });

  assert.equal(result.job.available_at, availableAt);
  assert.equal((await adapter.pull(queue, 10, { now: 1_059 })).length, 0);
  assert.equal(adapter.depth(queue), 1);
  assert.equal((await adapter.pull(queue, 10, { now: 1_060 })).length, 1);
});

test('retry scheduling uses bounded exponential backoff with injectable jitter', () => {
  const job = createJobEnvelope({
    account_id: 'acct_real',
    kind: 'repository.index',
    created_at: 1_000,
    retry: {
      max_attempts: 3,
      initial_delay_ms: 1_000,
      max_delay_ms: 10_000,
      backoff: 'exponential',
      jitter: true,
    },
  });

  assert.equal(computeRetryDelayMs(job.retry, 1, () => 0), 500);
  assert.equal(computeRetryDelayMs(job.retry, 2, () => 1), 2_000);

  const retry = createRetrySchedule(job, { now_ms: 1_000_000, random: () => 1 });
  assert.equal(retry.retryable, true);
  assert.equal(retry.job.status, 'retry_scheduled');
  assert.equal(retry.job.attempt, 1);
  assert.equal(retry.available_at, 1_001);

  const exhausted = createRetrySchedule({ ...job, attempt: 2 }, { now_ms: 1_000_000 });
  assert.equal(exhausted.retryable, false);
  assert.equal(exhausted.exhausted, true);
});

test('local queue failures are re-enqueued for a future deterministic retry', async () => {
  const adapter = new MemoryQueueAdapter();
  const control = new QueueControl({
    adapter,
    topology: buildQueueTopology({ namespace: 'demo', environment: 'test' }),
  });
  control.register('repository.*', async () => {
    throw new Error('temporary');
  });

  await control.enqueue({ account_id: 'acct_real', kind: 'repository.index' }, {
    created_at: 1_000,
    retry: { max_attempts: 3, initial_delay_ms: 1_000, max_delay_ms: 1_000, jitter: false },
  });
  const queue = resolvePhysicalQueue(control.topology, 'indexing');
  const [job] = await adapter.pull(queue, 1, { now: 1_000 });
  const [result] = await control.consume([job]);

  assert.equal(result.ok, false);
  assert.equal(result.retry.scheduled, true);
  assert.equal(result.retry.provider_managed, false);
  assert.equal(adapter.depth(queue), 1);
  assert.equal((await adapter.pull(queue, 1, { now: result.retry.available_at - 1 })).length, 0);
  assert.equal((await adapter.pull(queue, 1, { now: result.retry.available_at })).length, 1);
});

test('Cloudflare queue binding maps available_at to delaySeconds and rejects delays beyond provider limit', async () => {
  const calls = [];
  const adapter = new CloudflareQueueBindingAdapter({
    bindings: {
      default: {
        async send(body, options) { calls.push({ body, options }); },
      },
    },
  });
  const job = createJobEnvelope({
    account_id: 'acct_real',
    kind: 'deploy.cloudflare',
    created_at: 1_000,
    available_at: 1_600,
  });

  const receipt = await adapter.publish('demo', job, { now: 1_000 });
  assert.equal(receipt.delay_seconds, 600);
  assert.equal(calls[0].options.delaySeconds, 600);
  assert.equal(delaySecondsForAvailableAt(87_400, 1_000), 86_400);
  assert.throws(() => delaySecondsForAvailableAt(87_401, 1_000), /exceeds_24h/);
});

test('provider-managed retries receive a deterministic retry delay instead of immediate polling', async () => {
  const adapter = new MemoryQueueAdapter();
  const control = new QueueControl({
    adapter,
    topology: buildQueueTopology({ namespace: 'demo', environment: 'test' }),
  });
  control.register('deploy.*', async () => {
    throw new Error('pending');
  });
  const job = createJobEnvelope({
    account_id: 'acct_real',
    kind: 'deploy.cloudflare',
    logical_queue: 'deployments',
    retry: { max_attempts: 3, initial_delay_ms: 2_000, max_delay_ms: 2_000, jitter: false },
  });
  let retryOptions = null;
  const message = {
    body: job,
    attempts: 1,
    retry(options) { retryOptions = options; },
  };

  const [result] = await control.consume([message]);
  assert.equal(result.retry.provider_managed, true);
  assert.equal(result.retry.delay_seconds, 2);
  assert.deepEqual(retryOptions, { delaySeconds: 2 });
});


test('job execution identity always carries a stable idempotency key and run/step attribution', () => {
  const job = createJobEnvelope({
    id: 'job_fixed',
    account_id: 'acct_real',
    kind: 'embeddings.generate',
    run_id: 'arun_parent',
    step_id: 'step_embed',
  });
  assert.equal(job.idempotency_key, 'job_fixed');
  assert.deepEqual(jobExecutionIdentity(job), {
    job_id: 'job_fixed',
    run_id: 'arun_parent',
    step_id: 'step_embed',
    attempt: 0,
    idempotency_key: 'job_fixed',
    lease_owner: null,
    lease_expires_at: null,
    lease_generation: 0,
  });

  const explicit = createJobEnvelope({
    id: 'job_other',
    account_id: 'acct_real',
    kind: 'deploy.cloudflare',
    idempotency_key: 'deploy:commit:abc123',
  });
  assert.equal(explicit.idempotency_key, 'deploy:commit:abc123');
});

test('lease contract supports claim, refresh, release, crash expiry, and rejects live double claims', () => {
  const job = createJobEnvelope({
    account_id: 'acct_real',
    kind: 'repository.index',
    created_at: 1_000,
  });
  const claimed = claimJobLease(job, { owner: 'worker-a', now: 1_000, ttl_seconds: 30 });
  assert.equal(claimed.status, 'claimed');
  assert.equal(claimed.lease_owner, 'worker-a');
  assert.equal(claimed.lease_expires_at, 1_030);
  assert.equal(claimed.lease_generation, 1);
  assert.equal(canClaimJobLease(claimed, { owner: 'worker-b', now: 1_010 }), false);
  assert.throws(
    () => claimJobLease(claimed, { owner: 'worker-b', now: 1_010 }),
    /job_lease_held/,
  );

  const refreshed = refreshJobLease(claimed, { owner: 'worker-a', now: 1_010, ttl_seconds: 30 });
  assert.equal(refreshed.lease_expires_at, 1_040);
  assert.throws(
    () => refreshJobLease(refreshed, { owner: 'worker-a', now: 1_041, ttl_seconds: 30 }),
    /job_lease_expired/,
  );

  assert.equal(canClaimJobLease(refreshed, { owner: 'worker-b', now: 1_041 }), true);
  const reclaimed = claimJobLease(refreshed, { owner: 'worker-b', now: 1_041, ttl_seconds: 30 });
  assert.equal(reclaimed.lease_generation, 2);
  assert.equal(reclaimed.lease_owner, 'worker-b');

  const released = releaseJobLease(reclaimed, { owner: 'worker-b', status: 'queued' });
  assert.equal(released.lease_owner, null);
  assert.equal(released.lease_expires_at, null);
  assert.equal(released.status, 'queued');
});


test('provider-managed retry exhaustion stops requeueing instead of polling forever', async () => {
  const adapter = new MemoryQueueAdapter();
  const control = new QueueControl({
    adapter,
    topology: buildQueueTopology({ namespace: 'demo', environment: 'test' }),
  });
  control.register('deploy.*', async () => {
    throw new Error('still pending');
  });
  const job = createJobEnvelope({
    account_id: 'acct_real',
    kind: 'deploy.cloudflare',
    logical_queue: 'deployments',
    retry: { max_attempts: 3, initial_delay_ms: 1_000, max_delay_ms: 1_000, jitter: false },
  });
  let retried = false;
  let acked = false;
  const [result] = await control.consume([{
    body: job,
    attempts: 3,
    retry() { retried = true; },
    ack() { acked = true; },
  }]);
  assert.equal(retried, true);
  assert.equal(acked, false);
  assert.deepEqual(result.retry, {
    scheduled: false,
    exhausted: true,
    provider_managed: true,
    delegated_to_provider_dlq: true,
    attempt: 3,
    delay_ms: 1000,
    delay_seconds: 1,
  });
});

test('exhausted local retries are materialized as a deterministic dead-letter job', async () => {
  const topology = buildQueueTopology({ namespace: 'acp', environment: 'test' });
  const adapter = new MemoryQueueAdapter();
  const control = new QueueControl({ adapter, topology });
  control.register('always.fail', async () => {
    throw Object.assign(new Error('boom'), { code: 'provider_unavailable' });
  });

  const job = createJobEnvelope({
    id: 'job_exhaust_local',
    account_id: 'acct_1',
    kind: 'always.fail',
    logical_queue: 'jobs',
    retry: {
      max_attempts: 1,
      backoff: 'fixed',
      initial_delay_ms: 0,
      max_delay_ms: 0,
      jitter: false,
    },
  });

  const [result] = await control.consume([job]);
  assert.equal(result.ok, false);
  assert.equal(result.retry.exhausted, true);
  assert.equal(result.retry.dead_lettered, true);

  const dlq = resolvePhysicalQueue(topology, 'dead_letter');
  const [dead] = await adapter.pull(dlq, 1);
  assert.equal(dead.kind, 'dead_letter');
  assert.equal(dead.payload.original_job.id, 'job_exhaust_local');
  assert.equal(dead.payload.failure.code, 'provider_unavailable');
  assert.equal(dead.metadata.dead_letter, true);
});

test('Cloudflare consumer provisioning carries the topology dead-letter queue', async () => {
  const requests = [];
  const adapter = new CloudflareQueueApiAdapter({
    cloudflareAccountId: 'acct_cf',
    apiToken: 'token',
    fetchImpl: async (url, init = {}) => {
      requests.push({ url, init });
      if (init.method === 'POST' && url.endsWith('/consumers')) {
        return Response.json({ success: true, result: { consumer_id: 'consumer_1' } });
      }
      if (init.method === 'POST') {
        const name = JSON.parse(init.body).queue_name;
        return Response.json({ success: true, result: { queue_id: name + '_id', queue_name: name } });
      }
      return Response.json({ success: true, result: [] });
    },
  });

  const topology = buildQueueTopology({ namespace: 'acp', environment: 'prod' });
  const jobsQueue = resolvePhysicalQueue(topology, 'jobs');
  await adapter.ensureTopology(topology, {
    consumers: {
      [jobsQueue]: { script_name: 'agentsam-acp-consumer', max_retries: 3 },
    },
  });

  const consumerRequest = requests.find((row) => row.url.endsWith('/consumers'));
  assert.ok(consumerRequest);
  const body = JSON.parse(consumerRequest.init.body);
  assert.equal(body.dead_letter_queue, resolvePhysicalQueue(topology, 'dead_letter'));
  assert.equal(body.settings.max_retries, 3);
});
