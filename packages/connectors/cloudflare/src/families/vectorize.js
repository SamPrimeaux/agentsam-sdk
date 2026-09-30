import { createCloudflareApiClient } from '../api-client.js';

export const VECTORIZE_CAPABILITY_ID = 'cloudflare.vectorize';

const clean = value => String(value || '').trim();

function assertIndex(index) {
  const value = clean(index);
  if (!value) throw new Error('cloudflare_vectorize_index_required');
  return value;
}

function normalizeVector(record = {}) {
  const id = clean(record.id);
  const values = Array.isArray(record.values) ? record.values : record.vector;
  if (!id) throw new Error('cloudflare_vectorize_vector_id_required');
  if (!Array.isArray(values) || !values.length || values.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('cloudflare_vectorize_vector_values_required');
  }
  const vector = { id, values };
  if (record.namespace != null) vector.namespace = record.namespace;
  if (record.metadata != null) vector.metadata = record.metadata;
  return vector;
}

function workerBinding(binding, context = {}) {
  if (context.backend && typeof context.backend.query === 'function' && typeof context.backend.upsert === 'function') return context.backend;
  if (context.workerBinding && typeof context.workerBinding.query === 'function' && typeof context.workerBinding.upsert === 'function') return context.workerBinding;
  return context.env?.[binding] || null;
}

async function apiClient(context = {}) {
  if (context.apiClient) return context.apiClient;
  return createCloudflareApiClient({
    capabilityId: VECTORIZE_CAPABILITY_ID,
    env: context.env || process.env,
    ownerId: context.ownerId || context.owner_id || '',
    explicitAccountId: context.accountId || context.account_id || '',
    apiToken: context.apiToken || '',
    authMode: context.authMode,
    fetchImpl: context.fetchImpl,
    decryptUserOauthToken: context.decryptUserOauthToken,
  });
}

function indexPath(client, index, operation = '') {
  const suffix = `/vectorize/v2/indexes/${encodeURIComponent(assertIndex(index))}${operation ? `/${operation}` : ''}`;
  return client.accountPath(suffix);
}

export async function vectorizeUpsert({ binding, index, records, context = {} } = {}) {
  const vectors = (records || []).map(normalizeVector);
  const worker = workerBinding(binding, context);
  if (worker) return { transport: 'worker_binding', result: await worker.upsert(vectors) };
  const client = await apiClient(context);
  const ndjson = vectors.map(row => JSON.stringify(row)).join('\n') + (vectors.length ? '\n' : '');
  const result = await client.request('POST', indexPath(client, index, 'upsert'), {
    capabilityId: VECTORIZE_CAPABILITY_ID,
    operation: 'vectorize.upsert',
    headers: { 'Content-Type': 'application/x-ndjson' },
    body: ndjson,
  });
  return { transport: 'cloudflare_api', result: result.result, auth: result.auth };
}

export async function vectorizeQuery({ binding, index, vector, options = {}, context = {} } = {}) {
  if (!Array.isArray(vector) || !vector.length) throw new Error('cloudflare_vectorize_query_vector_required');
  const worker = workerBinding(binding, context);
  if (worker) return { transport: 'worker_binding', result: await worker.query(vector, options) };
  const client = await apiClient(context);
  const result = await client.request('POST', indexPath(client, index, 'query'), {
    capabilityId: VECTORIZE_CAPABILITY_ID,
    operation: 'vectorize.query',
    body: { vector, ...options },
  });
  return { transport: 'cloudflare_api', result: result.result, auth: result.auth };
}

export async function vectorizeDelete({ binding, index, ids, context = {} } = {}) {
  const normalizedIds = (ids || []).map(clean).filter(Boolean);
  const worker = workerBinding(binding, context);
  if (worker) {
    if (typeof worker.deleteByIds !== 'function') throw new Error('cloudflare_vectorize_worker_delete_unavailable');
    return { transport: 'worker_binding', result: await worker.deleteByIds(normalizedIds) };
  }
  const client = await apiClient(context);
  const result = await client.request('POST', indexPath(client, index, 'delete_by_ids'), {
    capabilityId: VECTORIZE_CAPABILITY_ID,
    operation: 'vectorize.delete_by_ids',
    body: { ids: normalizedIds },
  });
  return { transport: 'cloudflare_api', result: result.result, auth: result.auth };
}

export async function vectorizeGetByIds({ binding, index, ids, context = {} } = {}) {
  const normalizedIds = (ids || []).map(clean).filter(Boolean);
  const worker = workerBinding(binding, context);
  if (worker) {
    if (typeof worker.getByIds !== 'function') throw new Error('cloudflare_vectorize_worker_get_by_ids_unavailable');
    return { transport: 'worker_binding', result: await worker.getByIds(normalizedIds) };
  }
  const client = await apiClient(context);
  const result = await client.request('POST', indexPath(client, index, 'get_by_ids'), {
    capabilityId: VECTORIZE_CAPABILITY_ID,
    operation: 'vectorize.get_by_ids',
    body: { ids: normalizedIds },
  });
  return { transport: 'cloudflare_api', result: result.result, auth: result.auth };
}

export async function vectorizeHealth({ binding, index, context = {} } = {}) {
  const worker = workerBinding(binding, context);
  if (worker) {
    if (typeof worker.describe !== 'function') return { operational: true, transport: 'worker_binding', detail: null };
    return { operational: true, transport: 'worker_binding', detail: await worker.describe() };
  }
  try {
    const client = await apiClient(context);
    const result = await client.request('GET', indexPath(client, index, 'info'), {
      capabilityId: VECTORIZE_CAPABILITY_ID,
      operation: 'vectorize.info',
    });
    return { operational: true, transport: 'cloudflare_api', detail: result.result, auth: result.auth };
  } catch (error) {
    return { operational: false, transport: 'cloudflare_api', error: error?.code || error?.message || String(error) };
  }
}
