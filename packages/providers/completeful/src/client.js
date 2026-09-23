export const DEFAULT_COMPLETEFUL_API_ORIGIN = 'https://vxapi.completeful.com';

function trimSlashes(value) {
  return String(value || '').replace(/\/+$/, '');
}

export function completefulApiBase(apiUrl = DEFAULT_COMPLETEFUL_API_ORIGIN) {
  const configured = trimSlashes(apiUrl || DEFAULT_COMPLETEFUL_API_ORIGIN);
  return configured.endsWith('/v1') ? configured : `${configured}/v1`;
}

export function completefulKeyMode(apiKey) {
  const key = String(apiKey || '');
  if (key.startsWith('capp_test_')) return 'test';
  if (key.startsWith('capp_live_')) return 'live';
  return key ? 'unknown' : 'missing';
}

export class CompletefulApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'CompletefulApiError';
    this.status = details.status || 502;
    this.code = details.code || null;
    this.requestId = details.requestId || null;
    this.path = details.path || null;
    this.remediation = details.remediation || null;
    this.details = details.details || null;
    this.providerBody = details.providerBody || null;
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      request_id: this.requestId,
      path: this.path,
      remediation: this.remediation,
      details: this.details,
    };
  }
}

function buildUrl(base, path, query) {
  const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function parseProviderResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 4000) };
  }
}

export function createCompletefulClient({
  apiKey,
  apiUrl = DEFAULT_COMPLETEFUL_API_ORIGIN,
  allowLiveWrites = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('Completeful client requires a fetch implementation');
  }

  const base = completefulApiBase(apiUrl);
  const mode = completefulKeyMode(apiKey);

  function assertConfigured() {
    if (mode !== 'missing') return;
    throw new CompletefulApiError('Completeful API key is missing', {
      status: 503,
      code: 'completeful_not_configured',
      remediation: 'Resolve a Completeful API key through the host authority adapter.',
    });
  }

  function assertMutationAllowed() {
    assertConfigured();
    if (mode === 'test') return;
    if (mode === 'live' && allowLiveWrites) return;
    throw new CompletefulApiError('Completeful live writes are disabled', {
      status: 409,
      code: 'completeful_live_writes_disabled',
      remediation: 'Use a capp_test_ key or explicitly enable live writes in the host configuration.',
    });
  }

  async function request(method, path, { query = null, body = undefined, idempotencyKey = null, headers = null } = {}) {
    assertConfigured();

    const url = buildUrl(base, path, query);
    const requestHeaders = new Headers(headers || {});
    requestHeaders.set('Accept', 'application/json');
    requestHeaders.set('Authorization', `Bearer ${apiKey}`);

    let requestBody = body;
    if (body !== undefined && body !== null && !(body instanceof FormData)) {
      requestHeaders.set('Content-Type', 'application/json');
      requestBody = typeof body === 'string' ? body : JSON.stringify(body);
    }
    if (idempotencyKey) requestHeaders.set('Idempotency-Key', idempotencyKey);

    const response = await fetchImpl(url.toString(), {
      method,
      headers: requestHeaders,
      body: requestBody,
    });

    const data = await parseProviderResponse(response);
    const requestId =
      response.headers.get('x-request-id') ||
      response.headers.get('x-capp-request-id') ||
      data?.request_id ||
      null;

    const meta = {
      status: response.status,
      request_id: requestId,
      mode: response.headers.get('x-capp-mode') || null,
      dry_run: response.headers.get('x-capp-dry-run') === 'true',
    };

    if (!response.ok) {
      const provider = data && typeof data === 'object' ? data : {};
      throw new CompletefulApiError(
        provider.error || provider.message || `Completeful request failed (${response.status})`,
        {
          status: response.status,
          code: provider.code || 'completeful_request_failed',
          requestId,
          path: provider.path || url.pathname,
          remediation: provider.remediation || null,
          details: provider.details || null,
          providerBody: provider,
        },
      );
    }

    return { data, meta };
  }

  return {
    providerKey: 'completeful',
    apiBase: base,
    keyMode: mode,
    allowLiveWrites: Boolean(allowLiveWrites),
    request,
    assertConfigured,
    assertMutationAllowed,
  };
}
