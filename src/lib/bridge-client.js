const DEFAULT_BASE_URL = 'https://inneranimalmedia.com';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function resolveAgentSamBaseUrl(env = process.env, explicit = '') {
  return clean(
    explicit || env.AGENTSAM_BASE_URL || env.AGENTSAM_CORE_URL || env.IAM_CORE_URL || DEFAULT_BASE_URL,
  ).replace(/\/$/, '');
}

export function resolveBridgeKey(env = process.env, explicit = '') {
  return clean(explicit || env.AGENTSAM_BRIDGE_KEY);
}

/**
 * Machine-principal authentication only. User/workspace identity is deliberately
 * absent; the server resolves actor/resource authorization independently.
 */
export function buildBridgeHeaders(options = {}) {
  const env = options.env || process.env;
  const key = resolveBridgeKey(env, options.key);
  if (!key) throw new Error('AGENTSAM_BRIDGE_KEY_required');

  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    Authorization: `Bearer ${key}`,
    'X-Bridge-Key': key,
  };
}

export function createBridgeClient(options = {}) {
  const env = options.env || process.env;
  const baseUrl = resolveAgentSamBaseUrl(env, options.baseUrl);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch_required');

  async function request(pathname, requestOptions = {}) {
    const rawPath = String(pathname || '');
    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...requestOptions,
      headers: buildBridgeHeaders({
        env,
        key: options.key,
        headers: requestOptions.headers,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(String(payload?.error || payload?.message || `HTTP ${response.status}`));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  return {
    baseUrl,
    request,
    get(pathname, requestOptions = {}) {
      return request(pathname, { ...requestOptions, method: 'GET' });
    },
    post(pathname, body, requestOptions = {}) {
      return request(pathname, {
        ...requestOptions,
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      });
    },
  };
}
