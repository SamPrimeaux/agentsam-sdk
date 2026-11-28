import { CloudflareQueueApiAdapter } from '@inneranimalmedia/agentsam-queue-control/adapters/cloudflare';
import {
  assessCapabilityAuthorization,
  loadProviderPermissionCatalog,
  resolveCloudflareCredential,
} from '@inneranimalmedia/agentsam-connector-cloudflare';
import { createPluginOAuthPermissionRegistry } from './cloudflare-plugin-permission-registry.js';

const reply = (body, status = 200) => Response.json(body, {
  status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
});

function queueStatus(value) {
  return value === true ? 'delivery paused' : value === false ? 'delivery enabled' : 'unknown';
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
    producer_inventory_state: Array.isArray(queue.producers) ? 'ready' : 'unknown',
    consumer_inventory_state: Array.isArray(queue.consumers) ? 'ready' : 'unknown',
    producers_total_count: queue.producers_total_count == null && !Array.isArray(queue.producers)
      ? null : Number(queue.producers_total_count ?? configuredProducers.length),
    consumers_total_count: queue.consumers_total_count == null && !Array.isArray(queue.consumers)
      ? null : Number(queue.consumers_total_count ?? configuredConsumers.length),
    metrics,
  };
}

/** Account-owned Cloudflare queue view, authorized by the user's OAuth grant and queue capability. */
export async function handleStudioQueueObservability(request, env, userId, options = {}) {
  const {
    fetchImpl = fetch,
    resolveCredential = resolveCloudflareCredential,
    loadPermissionCatalog = async currentEnv => loadProviderPermissionCatalog(
      createPluginOAuthPermissionRegistry(currentEnv),'cloudflare',
    ),
    assessAuthorization = assessCapabilityAuthorization,
  } = options;
  if (request.method !== 'GET') return reply({ ok: false, error: 'method_not_allowed' }, 405);
  if (!userId) return reply({ ok: false, error: 'unauthorized' }, 401);

  let credential;
  try {
    credential = await resolveCredential({
      env, ownerId: userId, capabilityId: 'cloudflare.queues',
      authMode: 'oauth', fetchImpl,
    });
  } catch {
    return reply({ ok: false, error: 'cloudflare_oauth_required' }, 503);
  }
  if (credential?.status === 'configuration_required') {
    return reply({
      ok: false, error: 'cloudflare_account_selection_required',
      accounts: (credential.accounts || []).map(item => ({
        id: item.accountIdentifier || item.connectionId || null,
        label: item.accountLabel || item.label || 'Cloudflare account',
      })),
    }, 409);
  }
  if (credential?.error === 'cloudflare_reconnect_required') {
    return reply({ ok: false, error: 'cloudflare_reconnect_required' }, 409);
  }
  if (credential?.status !== 'ready' || !credential.bearerToken || !credential.accountId) {
    return reply({ ok: false, error: 'cloudflare_oauth_required' }, 503);
  }

  let permissionCatalog = null;
  try { permissionCatalog = await loadPermissionCatalog(env); }
  catch { /* A missing catalog is checked by the live API probe below, never by bypassing OAuth. */ }
  const authorization = assessAuthorization(
    'cloudflare.queues', credential.grantedScopes || [], permissionCatalog,
  );
  if (authorization?.status === 'needs_authorization') {
    return reply({
      ok: false, error: 'cloudflare_permission_denied',
      missing_scopes: authorization.missingScopes || [],
      permission: authorization.permissionLabel || null,
    }, 403);
  }
  if (authorization?.status === 'unavailable') {
    return reply({ ok: false, error: 'cloudflare_queue_capability_unavailable' }, 409);
  }

  const api = new CloudflareQueueApiAdapter({
    cloudflareAccountId: credential.accountId,
    apiToken: credential.bearerToken,
    fetchImpl,
  });
  let queues;
  try { queues = await api.listQueues(); }
  catch (error) {
    const forbidden = Number(error?.status) === 403;
    return reply({ ok: false, error: forbidden ? 'cloudflare_permission_denied' : 'cloudflare_queue_inventory_unavailable' }, forbidden ? 403 : 502);
  }

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
    if (queueId) {
      try { enriched = { ...queue, ...await api.getQueue(queueId) }; }
      catch { /* Retain list-level topology but do not fabricate missing bindings. */ }
    }
    if (!Array.isArray(enriched.consumers) && queueId) {
      try { enriched = { ...enriched, consumers: await api.listConsumers(queueId) }; }
      catch { /* Inventory remains visibly incomplete when consumers cannot be read. */ }
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
        headers: { authorization: 'Bearer ' + credential.bearerToken, 'content-type': 'application/json' },
        body: JSON.stringify({
          query: 'query QueueBacklogByHour($accountTag: string!, $queueId: string!, $datetimeStart: Time!, $datetimeEnd: Time!) { viewer { accounts(filter: { accountTag: $accountTag }) { backlog: queueBacklogAdaptiveGroups(limit: 48, filter: { queueId: $queueId, datetime_geq: $datetimeStart, datetime_leq: $datetimeEnd }, orderBy: [datetimeHour_ASC]) { dimensions { datetimeHour } avg { messages bytes } } } } }',
          variables: {
            accountTag: credential.accountId, queueId: selected.queue_id,
            datetimeStart: start.toISOString(), datetimeEnd: end.toISOString(),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || data.errors?.length) throw new Error('analytics_unavailable');
      history = {
        state: 'ready',
        points: (data.data?.viewer?.accounts?.[0]?.backlog || [])
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
    ok: true, source: 'cloudflare-oauth', collected_at: new Date().toISOString(),
    account_id: credential.accountId, queues: rows, ...(history ? { history } : {}),
  });
}
