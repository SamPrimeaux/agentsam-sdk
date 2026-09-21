const clean = value => String(value || '').trim();
function profileGuard(profile, supported) {
  if (!supported.includes(profile?.backend)) throw new Error(`backend_profile_mismatch:${profile?.backend}`);
  if (!Number.isInteger(profile?.dimensions) || profile.dimensions < 1) throw new Error('backend_dimensions_required');
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
export function createBackendRegistry() {
  const local = Object.freeze({
    id: 'local_exact', capabilities: () => ({ id: 'local_exact', exact: true, external_resource_required: false }),
    prepare(profile) { profileGuard(profile, ['local_exact']); return { id: 'local_exact', dimensions: profile.dimensions }; },
    async upsert(records, context = {}) { if (!context.store?.cachePut) throw new Error('backend_runtime_unavailable:local_exact'); for (const record of records) await context.store.cachePut(record.id, record.vector); return { upserted: records.length }; },
    async delete() { return { deleted: 0 }; }, async query() { throw new Error('backend_query_owned_by_knowledge_store'); }, async verify() { return { verified: true }; }, health: async () => ({ id: 'local_exact', operational: true }),
  });
  const adapters = new Map([['local_exact', local], ['postgres_pgvector', bindingBackend('postgres_pgvector', ['resource'])], ['supabase_pgvector', bindingBackend('supabase_pgvector', ['resource'])], ['cloudflare_vectorize', bindingBackend('cloudflare_vectorize', ['binding', 'index'])]]);
  return Object.freeze({ ids: () => [...adapters.keys()], get(id) { const item = adapters.get(clean(id)); if (!item) throw new Error(`backend_unsupported:${id}`); return item; }, capabilities: () => [...adapters.values()].map(adapter => adapter.capabilities()) });
}
