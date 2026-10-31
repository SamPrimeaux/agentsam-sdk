import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudflareQueueApiAdapter } from '../src/adapters/cloudflare.js';

const response = (result, status = 200) => Response.json({
  success: status === 200, result,
  ...(status === 200 ? {} : { errors: [{ code: 1000, message: 'Unavailable' }] }),
}, { status });

test('reads exact realtime backlog values, including a genuine zero', async () => {
  const calls = [];
  const api = new CloudflareQueueApiAdapter({
    cloudflareAccountId: 'account',
    apiToken: 'token',
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method });
      return response({ backlog_count: 0, backlog_bytes: 0, oldest_message_timestamp_ms: 0 });
    },
  });
  assert.deepEqual(await api.getMetrics('physical'), {
    backlog_count: 0, backlog_bytes: 0, oldest_message_timestamp_ms: 0,
  });
  assert.equal(calls[0].method, 'GET');
  assert.ok(calls[0].url.endsWith('/accounts/account/queues/physical/metrics'));
});

test('does not coerce absent Cloudflare metrics into zero', async () => {
  const api = new CloudflareQueueApiAdapter({
    cloudflareAccountId: 'account', apiToken: 'token',
    fetchImpl: async () => response({}),
  });
  await assert.rejects(() => api.getMetrics('physical'), /cloudflare_queue_metrics_invalid/);
});

test('reads consumers, paginates inventory and never mutates topology', async () => {
  const calls = [];
  const api = new CloudflareQueueApiAdapter({
    cloudflareAccountId: 'account', apiToken: 'token',
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      calls.push({ path: parsed.pathname, search: parsed.search, method: options.method });
      if (parsed.pathname.endsWith('/consumers')) return response([{ type: 'worker', script_name: 'consumer' }]);
      const page = Number(parsed.searchParams.get('page'));
      return response(page === 1
        ? Array.from({ length: 100 }, (_, n) => ({ queue_id: String(n), queue_name: String(n) }))
        : [{ queue_id: '100', queue_name: 'last' }]);
    },
  });
  assert.equal((await api.listQueues()).length, 101);
  assert.equal((await api.listConsumers('queue-01'))[0].script_name, 'consumer');
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.method === 'GET'));
  assert.equal(calls[1].search, '?page=2&per_page=100');
});
