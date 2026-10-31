import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleStudioQueueObservability,
  normalizeQueueInventory,
} from '../backend/worker/studio-queue-observability.js';

const accountId = 'cloudflare-account';
const adminId = 'au_operator';
const env = {
  CLOUDFLARE_ACCOUNT_ID: accountId,
  CLOUDFLARE_API_TOKEN: 'test-secret-never-to-client',
  QUEUE_OBSERVABILITY_ADMIN_IDS: adminId,
  QUEUE_OBSERVABILITY_OWNERS_JSON: '{"media-queue":{"owner_app":"MovieMode","environment":"production"}}',
};
const request = (path = '') => new Request('https://agentsam.test/api/queues/observability' + path);

function mockFetch(pathname, status = 200) {
  return async url => {
    const path = new URL(url).pathname;
    if (pathname && !path.includes(pathname)) throw new Error('unexpected URL ' + path);
    if (path.endsWith('/metrics')) return Response.json({
      success: true, result: { backlog_count: 0, backlog_bytes: 0, oldest_message_timestamp_ms: 0 },
    }, { status });
    if (path.endsWith('/consumers')) return Response.json({ success: true, result: [] });
    if (path.endsWith('/queues')) return Response.json({
      success: true, result: [{
        queue_id: 'queue_id_123', queue_name: 'media-queue',
        settings: { delivery_paused: false },
        producers: [{ type: 'worker', script: 'moviemode-service' }],
        consumers: [{ type: 'worker', script_name: 'media-consumer', dead_letter_queue: 'media-dlq' }],
      }],
    });
    throw Error('unexpected path: ' + path);
  };
}

test('operator-only: missing session and unauthorized accounts never reach Cloudflare', async () => {
  let fetched = false;
  const fetchImpl = async () => { fetched = true; throw Error('unexpected'); };
  assert.equal((await handleStudioQueueObservability(request(), env, null, { fetchImpl })).status, 401);
  assert.equal((await handleStudioQueueObservability(request(), env, 'au_other', { fetchImpl })).status, 403);
  assert.equal(fetched, false);
});

test('fail closed if provider credentials are not installed', async () => {
  const response = await handleStudioQueueObservability(request(), {
    QUEUE_OBSERVABILITY_ADMIN_IDS: adminId,
  }, adminId);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'cloudflare_queue_credentials_unavailable');
});

test('Cloudflare metrics preserve real zero and account topology without leaking token', async () => {
  const response = await handleStudioQueueObservability(request(), env, adminId, {
    fetchImpl: mockFetch(),
  });
  assert.equal(response.status, 200);
  const raw = await response.text();
  assert.ok(!raw.includes(env.CLOUDFLARE_API_TOKEN));
  const data = JSON.parse(raw);
  assert.equal(data.queues.length, 1);
  assert.equal(data.queues[0].metrics.state, 'ready');
  assert.equal(data.queues[0].metrics.backlog_count, 0);
  assert.equal(data.queues[0].owner_app, 'MovieMode');
  assert.equal(data.queues[0].consumers[0].dead_letter_queue, 'media-dlq');
});

test('failed metric reads remain unavailable, never become a fabricated zero', async () => {
  const fetchImpl = async url => new URL(url).pathname.endsWith('/metrics')
    ? Response.json({ success: false, errors: [{ message: 'temporary failure' }] }, { status: 502 })
    : mockFetch()(url);
  const response = await handleStudioQueueObservability(request(), env, adminId, { fetchImpl });
  const data = await response.json();
  assert.equal(data.queues[0].metrics.state, 'unavailable');
  assert.equal(data.queues[0].metrics.backlog_count, null);
});

test('history access is scoped to queue IDs returned by inventory', async () => {
  const response = await handleStudioQueueObservability(
    request('?queue_id=does-not-exist&history=24h'), env, adminId, { fetchImpl: mockFetch() },
  );
  assert.equal(response.status, 404);
});

test('queue inventory does not infer owner or environment when unknown', () => {
  const result = normalizeQueueInventory({ queue_id: 'abc', queue_name: 'unknown' }, {
    state: 'unavailable', backlog_count: null,
  });
  assert.equal(result.owner_app, null);
  assert.equal(result.environment, null);
  assert.deepEqual(result.producers, []);
  assert.deepEqual(result.consumers, []);
});
