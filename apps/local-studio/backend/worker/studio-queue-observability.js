import { CloudflareQueueApiAdapter } from '../../../../packages/agentsam-queue-control/src/adapters/cloudflare.js';

const reply = (body, status = 200) => Response.json(body, {
  status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
});

function allowedOperator(env, accountId) {
  const allowed = String(env.QUEUE_OBSERVABILITY_ADMIN_IDS || '').split(',')
    .map(id => id.trim()).filter(Boolean);
  return Boolean(accountId && allowed.includes(accountId));
}

function providerConfig(env) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(env.CLOUDFLARE_API_TOKEN || '').trim();
  return accountId && token ? { cloudflareAccountId: accountId, apiToken: token } : null;
}

function queueStatus(value) {
  return value === true ? 'paused' : value === false ? 'active' : 'unknown';
}

export function normalizeQueueInventory(queue, metrics, owners = {}) {
  const id = String(queue.queue_id || queue.id || '');
  const name = String(queue.queue_name || queue.name || '');
  const configuredConsumers = Array.isArray(queue.consumers) ? queue.consumers : [];
  const configuredProducers = Array.isArray(queue.producers) ? queue.producers : [];
  return {
    queue_id: id,
    queue_name: name,
    environment: owners[name]?.environment || null,
    owner_app: owners[name]?.owner_app || null,
    delivery_status: queueStatus(queue.settings?.delivery_paused),
    producers: configuredProducers.map(producer => ({
      type: producer.type || 'unknown',
      script: producer.script || null,
      bucket_name: producer.bucket_name || null,
    })),
    consumers: configuredConsumers.map(consumer => ({
      type: consumer.type || 'unknown',
      script_name: consumer.script_name || null,
      consumer_id: consumer.consumer_id || null,
      dead_letter_queue: consumer.dead_letter_queue || null,
      settings: consumer.settings || {},
    })),
    producers_total_count: Number(queue.producers_total_count ?? configuredProducers.length),
    consumers_total_count: Number(queue.consumers_total_count ?? configuredConsumers.length),
    metrics,
  };
}

/** Authenticated, operator-only queue inventory; never sends credentials to browsers. */
export async function handleStudioQueueObservability(request, env, accountId, {
  fetchImpl = fetch,
} = {}) {
  if (request.method !== 'GET') return reply({ ok: false, error: 'method_not_allowed' }, 405);
  if (!accountId) return reply({ ok: false, error: 'unauthorized' }, 401);
  if (!allowedOperator(env, accountId)) return reply({ ok: false, error: 'forbidden' }, 403);
  const config = providerConfig(env);
  if (!config) return reply({ ok: false, error: 'cloudflare_queue_credentials_unavailable' }, 503);
  const api = new CloudflareQueueApiAdapter({ ...config, fetchImpl });
  let queues;
  try { queues = await api.listQueues(); }
  catch { return reply({ ok: false, error: 'cloudflare_queue_inventory_unavailable' }, 502); }

  let owners = {};
  try {
    const configured = JSON.parse(String(env.QUEUE_OBSERVABILITY_OWNERS_JSON || '{}'));
    if (configured && typeof configured === 'object' && !Array.isArray(configured)) owners = configured;
  } catch { /* Invalid optional labels never affect queue data. */ }

  // Only metrics from Cloudflare, never synthetic application job statuses.
  const rows = await Promise.all(queues.map(async queue => {
    const queueId = queue.queue_id || queue.id;
    let metrics = { state: 'unavailable', backlog_count: null, backlog_bytes: null,
      oldest_message_timestamp_ms: null };
    if (queueId) {
      try {
        const raw = await api.getMetrics(queueId);
        metrics = {
          state: 'ready',
          backlog_count: raw.backlog_count,
          backlog_bytes: raw.backlog_bytes,
          oldest_message_timestamp_ms: raw.oldest_message_timestamp_ms,
        };
      } catch { /* A failed metrics read must not display a fabricated zero. */ }
    }
    let enriched = queue;
    if (!Array.isArray(queue.consumers) && queueId) {
      try { enriched = { ...queue, consumers: await api.listConsumers(queueId) }; }
      catch { /* Inventory may still display queue without consumer detail. */ }
    }
    return normalizeQueueInventory(enriched, metrics, owners);
  }));

  const url = new URL(request.url);
  const requestedId = url.searchParams.get('queue_id');
  const historyRequested = url.searchParams.get('history') === '24h';
  let history = null;
  if (historyRequested) {
    const selected = rows.find(row => row.queue_id === requestedId);
    if (!selected) return reply({ ok: false, error: 'queue_not_found' }, 404);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      const response = await fetchImpl('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: { authorization: `Bearer ${config.apiToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          query: `query QueueBacklogByHour($accountTag: string!, $queueId: string!, $datetimeStart: Time!, $datetimeEnd: Time!) {
            viewer { accounts(filter: { accountTag: $accountTag }) {
              queuesBacklogAdaptiveGroups: queuesBacklogAdaptiveGroups(
                limit: 48,
                filter: { queueId: $queueId, datetime_geq: $datetimeStart, datetime_leq: $datetimeEnd },
                orderBy: [datetimeHour_ASC]
              ) { dimensions { datetimeHour } avg { messages bytes } }
            } }
          }`,
          variables: {
            accountTag: config.cloudflareAccountId, queueId: selected.queue_id,
            datetimeStart: start.toISOString(), datetimeEnd: end.toISOString(),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || data.errors?.length) throw new Error('analytics_unavailable');
      history = {
        state: 'ready',
        points: (data.data?.viewer?.accounts?.[0]?.queuesBacklogAdaptiveGroups || [])
          .map(point => ({
            at: point.dimensions?.datetimeHour || null,
            backlog_count: point.avg?.messages ?? null,
            backlog_bytes: point.avg?.bytes ?? null,
          })),
      };
    } catch {
      history = { state: 'unavailable', points: [] };
    }
  }
  return reply({
    ok: true, source: 'cloudflare', collected_at: new Date().toISOString(),
    account_id: config.cloudflareAccountId, queues: rows, ...(history ? { history } : {}),
  });
}
