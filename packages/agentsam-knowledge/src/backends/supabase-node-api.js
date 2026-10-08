/**
 * Portable Supabase Edge node-api transport for Gemini semantic projections.
 * An authorized host supplies authentication; it is not persisted in project config.
 * This adapter does not own D1, Supabase schema, or the source repository.
 */
const value = input => String(input ?? '').trim();

export function nodeApiEndpoint({ endpoint, projectRef } = {}) {
  const raw = value(endpoint) || (value(projectRef) ? `https://${value(projectRef)}.supabase.co/functions/v1/node-api` : '');
  if (!raw) throw new Error('node_api_endpoint_required');
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) throw new Error('node_api_endpoint_invalid');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('node_api_https_required');
  return url.toString().replace(/\/$/, '');
}

export function createSupabaseNodeApiClient({ endpoint, projectRef, bridgeKey, getAuthHeaders, fetchImpl = globalThis.fetch, timeoutMs = 15000, principal } = {}) {
  const base = nodeApiEndpoint({ endpoint, projectRef });
  if (typeof fetchImpl !== 'function') throw new Error('node_api_fetch_required');
  const request = async (method, route, { params, body, authenticated = true } = {}) => {
    const url = new URL(`${base}/${route.replace(/^\/+/, '')}`);
    for (const [key, entry] of Object.entries(params || {})) if (entry != null && String(entry) !== '') url.searchParams.set(key, String(entry));
    const headers = { accept: 'application/json' };
    if (body != null) headers['content-type'] = 'application/json';
    if (authenticated) {
      const supplied = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : null;
      if (supplied) Object.assign(headers, supplied);
      else if (value(bridgeKey)) headers['x-agentsam-bridge-key'] = bridgeKey;
      else throw new Error('node_api_authorized_host_required');
      if (value(principal)) headers['x-agentsam-principal'] = principal;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method, headers, body: body == null ? undefined : JSON.stringify(body),
        signal: controller.signal, redirect: 'manual',
      });
      if (response.status >= 300 && response.status < 400) throw new Error('node_api_redirect_refused');
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) {
        // Never echo an upstream response containing operator credentials or arbitrary data.
        throw new Error(`node_api_request_failed:${route}:${response.status}:${value(payload?.error).slice(0,120) || 'unknown'}`);
      }
      if (!payload || typeof payload !== 'object') throw new Error('node_api_invalid_response');
      return payload;
    } finally { clearTimeout(timeout); }
  };
  return Object.freeze({
    endpoint: base,
    health: () => request('GET', 'health', { authenticated: false }),
    capabilities: () => request('GET', 'capabilities', { authenticated: false }),
    status: corpus => request('GET', ({ codebase: 'codebase/status', documents: 'vectors/status', memory: 'memory/status' })[corpus] || 'generations'),
    query({ accountId, repositoryId, corpus = 'codebase', query, limit = 8, ...filters } = {}) {
      if (!value(accountId)) throw new Error('node_api_account_required');
      if (!value(query)) throw new Error('node_api_query_required');
      if (!['codebase', 'documents', 'memory'].includes(corpus)) throw new Error('node_api_corpus_unsupported');
      return request('GET', 'vectors/query', { params: {
        account_id: accountId, repository_id: repositoryId, corpus, q: query, limit: Math.max(1, Math.min(Number(limit) || 8, 50)),
        ...filters,
      } });
    },
    async ingest({ accountId, repositoryId, generationId, corpus = 'codebase', items, sourceRef, embedding } = {}) {
      if (!value(accountId) || !value(generationId)) throw new Error('node_api_generation_authority_required');
      if (corpus === 'codebase' && !value(repositoryId)) throw new Error('node_api_repository_required');
      if (!['codebase', 'documents'].includes(corpus)) throw new Error('node_api_ingest_corpus_unsupported');
      if (!Array.isArray(items) || !items.length) throw new Error('node_api_items_required');
      const config = await request('GET', 'capabilities', { authenticated: false });
      const offered = config?.embedding;
      if (!offered?.default_model || !Number.isInteger(offered.default_dimensions)) throw new Error('node_api_embedding_capability_missing');
      if (embedding?.model && embedding.model !== offered.default_model) throw new Error('node_api_embedding_model_mismatch');
      if (embedding?.dimensions && embedding.dimensions !== offered.default_dimensions) throw new Error('node_api_embedding_dimensions_mismatch');
      const total = { ok: true, processed: 0, skipped: 0, failed: 0, job_ids: [], embedding: offered, batches: 0 };
      for (let start = 0; start < items.length; start += Math.min(100, offered.max_batch_size || 100)) {
        const batch = items.slice(start, start + Math.min(100, offered.max_batch_size || 100));
        const result = await request('POST', corpus === 'codebase' ? 'codebase/ingest' : 'vectors/ingest', { body: {
          account_id: accountId, repository_id: repositoryId, index_generation_id: generationId,
          source_ref: sourceRef || repositoryId || null,
          embedding: { model: offered.default_model, dimensions: offered.default_dimensions }, items: batch,
        } });
        if (result.ok !== true || Number(result.failed || 0)) throw new Error('node_api_ingest_not_verified');
        total.processed += Number(result.processed) || 0;
        total.skipped += Number(result.skipped) || 0;
        total.failed += Number(result.failed) || 0;
        total.batches++;
        if (result.job_id) total.job_ids.push(result.job_id);
      }
      return total;
    },
  });
}
