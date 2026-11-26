import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProviderWidgetData } from '../src/lib/widgets/provider-widget-data.ts';

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

 test('Cloudflare Resources uses the existing OAuth resource route and returns only safe inventory', async () => {
  const calls = [];
  const result = await loadProviderWidgetData('cloudflare-resources', {}, async (url, init) => {
    calls.push({ url: String(url), init });
    return response({
      ok: true, status: 'connected', checked_at: '2026-11-25T12:00:00Z',
      account: { id: 'cf-account-id' },
      r2: { status: 'connected', count: 2, buckets: [{ name: 'brand-assets', location: 'WNAM' }, { name: 'theme-store', location: 'ENAM' }] },
      images: { status: 'connected', count: 8 }, stream: { status: 'empty', count: 0 },
    });
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.provider, 'cloudflare');
  assert.equal(result.data.r2.count, 2);
  assert.equal(result.data.r2.buckets[0].name, 'brand-assets');
  assert.match(calls[0].url, /^\/api\/connections\/cloudflare\/resources/);
  assert.equal(calls[0].init.credentials, 'same-origin');
  assert.equal(JSON.stringify(result).includes('access_token'), false);
});

test('GitHub Activity reads the authenticated connection and repository endpoint', async () => {
  const calls = [];
  const result = await loadProviderWidgetData('github-activity', {}, async (url) => {
    calls.push(String(url));
    if (String(url).includes('/status')) return response({ ok: true, connections: [{ id: 'github:sam', accountLabel: 'Sam GitHub', accountIdentifier: 'sam' }] });
    return response({ ok: true, repositories: [{ id: 1, fullName: 'sam/platform', private: true, defaultBranch: 'main', updatedAt: '2026-11-25T11:00:00Z', htmlUrl: 'https://github.com/sam/platform' }], hasMore: false });
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.accountLabel, 'Sam GitHub');
  assert.equal(result.data.repositories[0].fullName, 'sam/platform');
  assert.equal(calls.length, 2);
  assert.match(calls[1], /connection_id=github%3Asam/);
  assert.equal(JSON.stringify(result).includes('access_token'), false);
});

test('Google Drive Recent Files reads through the existing account media endpoint', async () => {
  const calls = [];
  const result = await loadProviderWidgetData('google-drive-recent', {}, async (url) => {
    calls.push(String(url));
    if (String(url).includes('/status')) return response({ ok: true, connections: [{ id: 'google_drive:sam@example.com', accountLabel: 'Sam Drive' }] });
    return response({ ok: true, account: { label: 'Sam Drive' }, assets: [{ id: 'file-1', filename: 'Brand guide.pdf', content_type: 'application/pdf', updated_at: '2026-11-25T09:00:00Z', meta: { web_view_url: 'https://drive.google.com/file/d/file-1/view' } }] });
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.provider, 'google_drive');
  assert.equal(result.data.files[0].name, 'Brand guide.pdf');
  assert.match(calls[1], /^\/api\/admin\/media\?source=drive/);
  assert.match(calls[1], /page_size=6/);
  assert.equal(JSON.stringify(result).includes('access_token'), false);
});

test('unconnected providers return a connection state instead of fabricated data', async () => {
  const result = await loadProviderWidgetData('github-activity', {}, async () => response({ ok: true, connections: [] }));
  assert.equal(result.status, 'not_connected');
  assert.equal(result.provider, 'github');
  assert.equal(result.data, undefined);
});


test('Cloudflare Queue Depth uses the existing account-scoped observability endpoint', async () => {
  const calls = [];
  const result = await loadProviderWidgetData('queues', {}, async (url) => {
    calls.push(String(url));
    return response({ ok: true, collected_at: '2026-11-25T12:00:00Z', queues: [{
      queue_id: 'orders', queue_name: 'orders', environment: 'production', owner_app: 'storefront',
      delivery_status: 'active', producers_total_count: 2, consumers_total_count: 3,
      metrics: { state: 'ready', backlog_count: 14, backlog_bytes: 4096, oldest_message_timestamp_ms: 1795600000000 },
    }] });
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.provider, 'cloudflare');
  assert.equal(result.data.queues[0].queue_name, 'orders');
  assert.equal(result.data.queues[0].metrics.backlog_count, 14);
  assert.equal(calls[0], '/api/queues/observability');
});

test('Cloudflare Queue Depth history is requested separately by queue id', async () => {
  const calls = [];
  const result = await loadProviderWidgetData('queues', { history: '24h', queueId: 'orders' }, async (url) => {
    calls.push(String(url));
    return response({ ok: true, history: { state: 'ready', points: [{ at: '2026-11-25T11:00:00Z', backlog_count: 14 }] } });
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.data.history.points[0].backlog_count, 14);
  assert.match(calls[0], /history=24h/);
  assert.match(calls[0], /queue_id=orders/);
});
