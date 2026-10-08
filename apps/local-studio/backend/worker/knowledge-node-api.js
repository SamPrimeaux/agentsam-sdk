/**
 * Account-authorized gateway to a host-configured Supabase node-api.
 * No browser or installed SDK client receives AGENTSAM_BRIDGE_KEY.
 * The host, not caller-supplied headers, supplies the IAM account identity.
 */
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const clean = value => String(value ?? '').trim();
const STATUS_ROUTES = new Set(['health', 'capabilities', 'codebase/status', 'vectors/status', 'memory/status', 'generations']);
const QUERY_CORPORA = new Set(['codebase', 'documents', 'memory']);
const INGEST_CORPORA = new Set(['codebase', 'documents']);

function resolveEndpoint(env) {
  const raw = clean(env.AGENTSAM_NODE_API_URL);
  if (!raw) throw new Error('node_api_endpoint_not_configured');
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('node_api_endpoint_invalid');
  return parsed.toString().replace(/\/$/, '');
}

function safeError(status, route) {
  if (status === 401 || status === 403) return 'node_api_bridge_auth_rejected';
  if (status === 429) return 'node_api_rate_limited';
  if (status >= 500) return 'node_api_upstream_unavailable';
  return `node_api_${route.replace(/[^a-z0-9]/gi, '_')}_failed`;
}

export async function handleKnowledgeNodeApiRequest(request, env, accountId, { fetchImpl = fetch } = {}) {
  if (!accountId) return json({ ok: false, error: 'unauthorized' }, 401);
  const base = resolveEndpoint(env);
  const bridge = clean(env.AGENTSAM_BRIDGE_KEY);
  if (!bridge) return json({ ok: false, error: 'node_api_bridge_not_configured' }, 503);
  const url = new URL(request.url);
  const segment = url.pathname.replace(/^\/api\/knowledge\/node-api\/?/, '').replace(/\/$/, '') || 'health';
  const method = request.method;
  if (!STATUS_ROUTES.has(segment) && !['vectors/query', 'codebase/ingest', 'vectors/ingest'].includes(segment)) {
    return json({ ok: false, error: 'not_found' }, 404);
  }
  const isQuery = segment === 'vectors/query';
  const isIngest = segment === 'codebase/ingest' || segment === 'vectors/ingest';
  if ((isQuery || isIngest) && request.headers.get('x-agentsam-paid-approved') !== 'true') {
    return json({ ok: false, error: 'node_api_paid_operation_requires_approval' }, 403);
  }
  if ((STATUS_ROUTES.has(segment) || isQuery) && method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
  if (isIngest && method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  // Never derive an upstream URL from a caller-controlled path or host.
  const target = new URL(`${base}/${segment}`);
  if (isQuery) {
    const query = clean(url.searchParams.get('q'));
    const corpus = clean(url.searchParams.get('corpus')) || 'codebase';
    const repository = clean(url.searchParams.get('repository_id'));
    if (!query || query.length > 750 || !QUERY_CORPORA.has(corpus)) return json({ ok: false, error: 'node_api_query_invalid' }, 400);
    if (corpus === 'codebase' && !repository) return json({ ok: false, error: 'node_api_repository_required' }, 400);
    if (corpus === 'documents' && !repository) return json({ ok: false, error: 'node_api_document_repository_required' }, 400);
    target.searchParams.set('q', query);
    target.searchParams.set('corpus', corpus);
    target.searchParams.set('account_id', accountId);
    target.searchParams.set('limit', String(Math.max(1, Math.min(8, Number(url.searchParams.get('limit')) || 8))));
    if (repository && corpus !== 'documents') target.searchParams.set('repository_id', repository);
    if (corpus === 'documents') target.searchParams.set('source_type', `repository:${repository}`);
    // Memory owns optional project/source filters but account cannot be overridden.
  }

  let body;
  if (isIngest) {
    if (Number(request.headers.get('content-length') || 0) > 100000) return json({ ok: false, error: 'node_api_payload_too_large' }, 413);
    const text = await request.text();
    if (text.length > 90000) return json({ ok: false, error: 'node_api_payload_too_large' }, 413);
    let input;
    try { input = JSON.parse(text); } catch { return json({ ok: false, error: 'invalid_json_body' }, 400); }
    const items = input?.items;
    const repository = clean(input?.repository_id);
    const generation = clean(input?.index_generation_id);
    const corpus = segment === 'codebase/ingest' ? 'codebase' : 'documents';
    if (!INGEST_CORPORA.has(corpus) || !repository || !generation || !Array.isArray(items) || !items.length || items.length > 20) {
      return json({ ok: false, error: 'node_api_ingest_scope_invalid' }, 400);
    }
    if (!items.every(item => typeof item.content === 'string' && item.content.length > 0 && item.content.length <= 4000 && clean(item.id).length > 0)) {
      return json({ ok: false, error: 'node_api_ingest_items_invalid' }, 400);
    }
    const filtered = items.map(item => corpus === 'codebase'
      ? ({ id: clean(item.id), repository_id: repository, file_path: clean(item.file_path),
        node_type: clean(item.node_type) || 'code_chunk', node_name: clean(item.node_name) || clean(item.file_path),
        line_start: item.line_start || null, line_end: item.line_end || null,
        content: item.content, metadata: { source: 'sdk_knowledge_node_api' } })
      : ({ id: clean(item.id), title: clean(item.title) || clean(item.source_path),
        content: item.content, source_type: `repository:${repository}`, source_path: clean(item.source_path),
        chunk_index: Number.isInteger(item.chunk_index) ? item.chunk_index : 0,
        chunk_type: 'section', metadata: { repository_id: repository, source: 'sdk_knowledge_node_api' } }));
    if (corpus === 'codebase' && filtered.some(item => !item.file_path || !item.node_name)) return json({ ok: false, error: 'node_api_code_identity_required' }, 400);
    body = JSON.stringify({ account_id: accountId, repository_id: repository, index_generation_id: generation,
      source_ref: repository, items: filtered });
  }

  try {
    const response = await fetchImpl(target.toString(), {
      method,
      headers: { 'accept': 'application/json', 'content-type': 'application/json', 'x-agentsam-bridge-key': bridge },
      body, redirect: 'manual', signal: AbortSignal.timeout(20000),
    });
    if (response.status >= 300 && response.status < 400) return json({ ok: false, error: 'node_api_redirect_refused' }, 502);
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok === false) return json({ ok: false, error: safeError(response.status, segment), upstream_status: response.status }, response.ok || response.status >= 500 ? 502 : response.status);
    if (!data || typeof data !== 'object') return json({ ok: false, error: 'node_api_invalid_response' }, 502);
    if (segment === 'health' || segment === 'capabilities') {
      // A public Edge health response alone does not establish matching bridge keys.
      return json({ ...data, ...(segment === 'capabilities' && data.embedding ? {
        embedding: { ...data.embedding, max_batch_size: Math.min(20, Number(data.embedding.max_batch_size) || 20), max_chunk_chars: 4000 },
      } : {}), bridge_verified: false, upstream: 'node-api' });
    }
    if (isIngest) return json({ ok: Boolean(data.ok), processed: data.processed ?? 0, skipped: data.skipped ?? 0,
      failed: data.failed ?? 0, job_id: data.job_id || null, account_scoped: true, generation_activated: false });
    if (segment === 'codebase/status') return json({ ...data, ok: true, bridge_verified: true, scope: 'bridge_connection_only' });
    return json(data);
  } catch {
    return json({ ok: false, error: 'node_api_transport_unavailable' }, 502);
  }
}
