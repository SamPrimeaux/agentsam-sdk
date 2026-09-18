import { resolveIamOrigin } from '../../packages/identity/src/contracts/auth-config.js';
import { resolveAccountAuthority } from './auth.js';

/**
 * IAM CORE client — SDK is a delivery mechanism; intelligence lives server-side.
 *
 * IAM_OAUTH_ISSUER is the canonical platform authority/API origin. IAM_ORIGIN,
 * IAM_CORE_URL and AGENTSAM_CORE_URL remain compatibility fallbacks.
 */
export function coreBaseUrl(env = process.env) {
  const explicit = env?.IAM_OAUTH_ISSUER || env?.IAM_ORIGIN || env?.IAM_CORE_URL || env?.AGENTSAM_CORE_URL || '';
  return resolveIamOrigin(env, explicit);
}

function authOptions(options) {
  if (typeof options === 'string') return { explicit: options };
  return options && typeof options === 'object' ? options : {};
}

export async function resolveCoreAuthority(options = {}) {
  const resolvedOptions = authOptions(options);
  const resolver = resolvedOptions.resolveAuthorityImpl || resolveAccountAuthority;
  const authority = await resolver({
    env: resolvedOptions.env || process.env,
    home: resolvedOptions.home,
    explicit: resolvedOptions.explicit || resolvedOptions.token || '',
    fetchImpl: resolvedOptions.fetchImpl,
    issuer: resolvedOptions.issuer,
    signal: resolvedOptions.signal,
    nowMs: resolvedOptions.nowMs,
    skewMs: resolvedOptions.skewMs,
    refreshImpl: resolvedOptions.refreshImpl,
  });
  if (authority?.error) throw new Error(authority.error);
  if (!authority?.value) throw new Error('account_auth_required');
  return authority;
}

async function authorizedHeaders(headers, options = {}) {
  const authority = await resolveCoreAuthority(options);
  return {
    ...headers,
    Authorization: `Bearer ${authority.value}`,
  };
}

async function responseJson(res) {
  return res.json().catch(() => ({}));
}

export async function postJson(path, body, options = {}) {
  const resolvedOptions = authOptions(options);
  const fetchImpl = resolvedOptions.fetchImpl || fetch;
  const headers = await authorizedHeaders({
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }, resolvedOptions);
  const res = await fetchImpl(`${coreBaseUrl(resolvedOptions.env || process.env)}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
    signal: resolvedOptions.signal,
  });
  const data = await responseJson(res);
  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  return data;
}

export async function getJson(path, options = {}) {
  const resolvedOptions = authOptions(options);
  const fetchImpl = resolvedOptions.fetchImpl || fetch;
  const headers = await authorizedHeaders({ Accept: 'application/json' }, resolvedOptions);
  const res = await fetchImpl(`${coreBaseUrl(resolvedOptions.env || process.env)}${path}`, {
    headers,
    signal: resolvedOptions.signal,
  });
  const data = await responseJson(res);
  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  return data;
}

/**
 * Stream NDJSON from POST /api/sdk/scaffold — calls onEvent for each line.
 */
export async function streamScaffold(body, onEvent, options = {}) {
  const resolvedOptions = authOptions(options);
  const fetchImpl = resolvedOptions.fetchImpl || fetch;
  const headers = await authorizedHeaders({
    'Content-Type': 'application/json',
    Accept: 'application/x-ndjson',
  }, resolvedOptions);
  const res = await fetchImpl(`${coreBaseUrl(resolvedOptions.env || process.env)}/api/sdk/scaffold`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: resolvedOptions.signal,
  });
  if (!res.ok) {
    const data = await responseJson(res);
    throw new Error(data?.error || `scaffold HTTP ${res.status}`);
  }
  if (!res.body) throw new Error('scaffold stream missing');

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const text = line.trim();
      if (!text) continue;
      try {
        await onEvent(JSON.parse(text));
      } catch {
        /* ignore malformed stream lines */
      }
    }
  }
  const tail = buf.trim();
  if (tail) {
    try {
      await onEvent(JSON.parse(tail));
    } catch {
      /* ignore malformed trailing line */
    }
  }
}
