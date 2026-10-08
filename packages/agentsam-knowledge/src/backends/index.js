import { createSupabaseNodeApiClient } from './supabase-node-api.js';
import { vectorizeDelete, vectorizeGetByIds, vectorizeHealth, vectorizeQuery, vectorizeUpsert } from '../../../connectors/cfoa/src/families/vectorize.js';

const clean = value => String(value || '').trim();
function profileGuard(profile, supported) {
  if (!supported.includes(profile?.backend)) throw new Error(`backend_profile_mismatch:${profile?.backend}`);
  if (!Number.isInteger(profile?.dimensions) || profile.dimensions < 1) throw new Error('backend_dimensions_required');
}
function vectorizeBackend() {
  const id = 'cloudflare_vectorize';
  const resource = context => ({ binding: clean(context?.binding || context?.profile?.binding), index: clean(context?.index || context?.profile?.index) });
  return Object.freeze({
    id,
    capabilities: () => ({ id, explicit_resource_required: true, supported: true, transports: ['worker_binding', 'cloudflare_api'] }),
    prepare(profile, context = {}) {
      profileGuard(profile, [id]);
      const target = { binding: clean(context.binding || profile.binding), index: clean(context.index || profile.index) };
      if (!target.binding) throw new Error('backend_cloudflare_vectorize_binding_required');
      if (!target.index) throw new Error('backend_cloudflare_vectorize_index_required');
      return { id, dimensions: profile.dimensions, ...target };
    },
    async upsert(records, context = {}) { return vectorizeUpsert({ ...resource(context), records, context }); },
    async delete(ids, context = {}) { return vectorizeDelete({ ...resource(context), ids, context }); },
    async query(vector, options = {}, context = {}) { return vectorizeQuery({ ...resource(context), vector, options, context }); },
    async verify(ids, context = {}) {
      const receipt = await vectorizeGetByIds({ ...resource(context), ids, context });
      const rows = Array.isArray(receipt.result) ? receipt.result : null;
      return { verified: rows ? rows.length === ids.length : true, transport: receipt.transport, result: receipt.result };
    },
    async health(context = {}) {
      const target = resource(context);
      if (!target.binding || !target.index) return { id, operational: false, error: 'binding_and_index_required' };
      const health = await vectorizeHealth({ ...target, context });
      return { id, ...health };
    },
  });
}

function bindingBackend(id, required) {
  return Object.freeze({
    id, capabilities: () => ({ id, explicit_resource_required: true, supported: true }),
    prepare(profile, context = {}) { profileGuard(profile, [id]); for (const key of required) if (!clean(context[key] || profile[key])) throw new Error(`backend_${id}_${key}_required`); return { id, dimensions: profile.dimensions }; },
    async upsert(records, context = {}) { const backend = context.backend; if (!backend?.upsert) throw new Error(`backend_runtime_unavailable:${id}`); return backend.upsert(records); },
    async delete(ids, context = {}) { const backend = context.backend; if (!backend?.delete) throw new Error(`backend_runtime_unavailable:${id}`); return backend.delete(ids); },
    async query(vector, options, context = {}) { const backend = context.backend; if (!backend?.query) throw new Error(`backend_runtime_unavailable:${id}`); return backend.query(vector, options); },
    async verify(ids, context = {}) { const backend = context.backend; if (!backend?.verify) throw new Error(`backend_runtime_unavailable:${id}`); return backend.verify(ids); },
    health: async context => ({ id, operational: Boolean(context?.backend) }),
  });
}
function supabasePgvectorBackend() {
  const base = bindingBackend('supabase_pgvector', ['resource']);
  return Object.freeze({
    ...base,
    capabilities: () => ({ ...base.capabilities(), transports: ['postgres_connection', 'supabase_edge_node_api'], authorization: 'injected_host' }),
    connect: options => createSupabaseNodeApiClient(options),
    queryText(query, options = {}, context = {}) {
      if (!context.nodeApiClient) throw new Error('backend_authorized_node_api_client_required');
      return context.nodeApiClient.query({ ...options, query });
    },
    ingestGeneration(request, context = {}) {
      if (!context.nodeApiClient) throw new Error('backend_authorized_node_api_client_required');
      return context.nodeApiClient.ingest(request);
    },
  });
}

export function createBackendRegistry() {
  const local = Object.freeze({
    id: 'local_exact', capabilities: () => ({ id: 'local_exact', exact: true, external_resource_required: false }),
    prepare(profile) { profileGuard(profile, ['local_exact']); return { id: 'local_exact', dimensions: profile.dimensions }; },
    async upsert(records, context = {}) { if (!context.store?.cachePut) throw new Error('backend_runtime_unavailable:local_exact'); for (const record of records) await context.store.cachePut(record.id, record.vector); return { upserted: records.length }; },
    async delete() { return { deleted: 0 }; }, async query() { throw new Error('backend_query_owned_by_knowledge_store'); }, async verify() { return { verified: true }; }, health: async () => ({ id: 'local_exact', operational: true }),
  });
  const adapters = new Map([['local_exact', local], ['postgres_pgvector', bindingBackend('postgres_pgvector', ['resource'])], ['supabase_pgvector', supabasePgvectorBackend()], ['cloudflare_vectorize', vectorizeBackend()]]);
  return Object.freeze({ ids: () => [...adapters.keys()], get(id) { const item = adapters.get(clean(id)); if (!item) throw new Error(`backend_unsupported:${id}`); return item; }, capabilities: () => [...adapters.values()].map(adapter => adapter.capabilities()) });
}

export { createSupabaseNodeApiClient, nodeApiEndpoint } from './supabase-node-api.js';
