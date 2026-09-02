/** Fetch-only client: safe to import in Cloudflare Workers; no Node runtime dependencies. */
export function createKnowledgeServiceClient({ baseUrl, token, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Expected an HTTP(S) service URL without credentials.');
  if (!token) throw new Error('A service token is required.');
  const call = async (route, { body, idempotencyKey } = {}) => {
    const headers = { authorization: `Bearer ${token}` };
    if (body) headers['content-type'] = 'application/json';
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    const response = await fetchImpl(new URL(route, url), { method: body ? 'POST' : 'GET', headers,
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
    const value = await response.json();
    if (!response.ok) throw Object.assign(new Error(value.error || `Knowledge service returned ${response.status}`), { status: response.status });
    return value;
  };
  return { repositories: () => call('/v1/repositories'), submit: (body, idempotencyKey) => call('/v1/jobs', { body, idempotencyKey }),
    job: id => { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid job id.'); return call(`/v1/jobs/${id}`); } };
}
