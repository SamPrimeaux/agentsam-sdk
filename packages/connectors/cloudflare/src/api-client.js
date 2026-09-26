/**
 * Cloudflare API v4 client for AgentSam CLI / connector families.
 *
 * Prefer createCloudflareApiClient() so OAuth + API-token lanes share one transport.
 * Constructor remains sync for direct-token / test injection — no hidden DB I/O.
 */

import { cloudflarePermissionRemediation, getCloudflareCapability } from './capabilities.js';
import { resolveCloudflareCredential, credentialSafeMeta } from './credential.js';

const API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Env-only sync helper for CLI.
 * Does NOT fall back to CLOUDFLARE_IMAGES_API_TOKEN (Images-family only).
 */
export function resolveCloudflareApiAuth(env = process.env) {
  const apiToken = String(env.CLOUDFLARE_API_TOKEN || '').trim();
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  return {
    apiToken,
    accountId,
    configured: Boolean(apiToken),
    account_resolved: Boolean(accountId),
  };
}

export class CloudflareApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'CloudflareApiError';
    this.code = details.code || 'cloudflare_api_error';
    this.httpStatus = details.httpStatus || null;
    this.providerErrors = details.providerErrors || [];
    this.capabilityId = details.capabilityId || null;
    this.operation = details.operation || null;
    this.path = details.path || null;
    this.remediation = details.remediation || null;
  }

  toJSON() {
    return {
      ok: false,
      error: this.code,
      message: this.message,
      http_status: this.httpStatus,
      provider_errors: this.providerErrors,
      capability_id: this.capabilityId,
      operation: this.operation,
      path: this.path,
      remediation: this.remediation,
    };
  }
}

export class CloudflareApiClient {
  constructor({
    apiToken = '',
    accountId = '',
    authSource = 'api_token',
    connectionId = null,
    grantedScopes = [],
    capabilityId = null,
    fetchImpl = globalThis.fetch,
    env = process.env,
  } = {}) {
    const auth = resolveCloudflareApiAuth(env);
    this.apiToken = String(apiToken || auth.apiToken || '').trim();
    this.accountId = String(accountId || auth.accountId || '').trim();
    this.authSource = authSource || (this.apiToken ? 'api_token' : 'missing');
    this.connectionId = connectionId;
    this.grantedScopes = Array.isArray(grantedScopes) ? grantedScopes : [];
    this.capabilityId = capabilityId;
    this.fetchImpl = fetchImpl;
  }

  authMeta() {
    return credentialSafeMeta({
      source: this.authSource,
      accountId: this.accountId,
      connectionId: this.connectionId,
      grantedScopes: this.grantedScopes,
      capabilityId: this.capabilityId,
      status: this.apiToken ? 'ready' : 'token_required',
    });
  }

  requireToken(operation = 'cloudflare.api') {
    if (!this.apiToken) {
      throw new CloudflareApiError('Cloudflare credential required (OAuth connection or CLOUDFLARE_API_TOKEN)', {
        code: 'cloudflare_credential_required',
        operation,
        capabilityId: this.capabilityId,
        remediation: {
          actions: [
            'Connect Cloudflare via Local Studio OAuth',
            'Or set CLOUDFLARE_API_TOKEN for CLI/CI',
          ],
          authorize_hint: 'agentsam cloudflare status',
        },
      });
    }
  }

  requireAccount(operation = 'cloudflare.api') {
    this.requireToken(operation);
    if (!this.accountId) {
      throw new CloudflareApiError('CLOUDFLARE_ACCOUNT_ID / connected account required', {
        code: 'cloudflare_account_id_required',
        operation,
        remediation: {
          actions: ['Set CLOUDFLARE_ACCOUNT_ID', 'Or reconnect Cloudflare OAuth so account_identifier is stored'],
          authorize_hint: 'export CLOUDFLARE_ACCOUNT_ID=…',
        },
      });
    }
  }

  async request(method, path, opts = {}) {
    const operation = opts.operation || `${method} ${path}`;
    const capabilityId = opts.capabilityId || this.capabilityId;
    this.requireToken(operation);

    let url;
    if (/^https?:\/\//i.test(path)) {
      url = new URL(path);
    } else {
      url = new URL(path.startsWith('/') ? path : `/${path}`, `${API_BASE}/`);
    }
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v == null || v === '') continue;
        url.searchParams.set(k, String(v));
      }
    }

    const headers = {
      Authorization: `Bearer ${this.apiToken}`,
      Accept: 'application/json',
    };
    let body;
    if (opts.body != null && method !== 'GET' && method !== 'HEAD') {
      if (opts.body instanceof FormData || typeof opts.body === 'string' || Buffer.isBuffer(opts.body)) {
        body = opts.body;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(opts.body);
      }
    }

    let res;
    let json = null;
    try {
      res = await this.fetchImpl(url.toString(), { method, headers, body });
      const ct = String(res.headers.get('content-type') || '');
      if (opts.raw || ct.includes('image/') || ct.includes('octet-stream') || ct.includes('text/html')) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (!res.ok) throw this.#fail(res, null, { ...opts, capabilityId }, operation, url.pathname);
        return { ok: true, http_status: res.status, headers: Object.fromEntries(res.headers), body: buf };
      }
      const text = await res.text();
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
    } catch (err) {
      if (err instanceof CloudflareApiError) throw err;
      throw new CloudflareApiError(String(err?.message || err), {
        code: 'cloudflare_network_error',
        operation,
        path,
        capabilityId,
      });
    }

    if (!res.ok || json?.success === false) {
      throw this.#fail(res, json, { ...opts, capabilityId }, operation, url.pathname);
    }

    return {
      ok: true,
      http_status: res.status,
      success: json?.success !== false,
      result: json?.result ?? json,
      result_info: json?.result_info || null,
      errors: json?.errors || [],
      messages: json?.messages || [],
      auth: this.authMeta(),
      raw: json,
    };
  }

  #fail(res, json, opts, operation, path) {
    const providerErrors = json?.errors || [];
    const message = providerErrors[0]?.message
      || `Cloudflare API ${res.status} for ${operation}`;
    const remediation = (res.status === 403 || res.status === 401)
      ? cloudflarePermissionRemediation({
        capabilityId: opts.capabilityId,
        operation,
        httpStatus: res.status,
        providerMessage: message,
      })
      : null;
    return new CloudflareApiError(message, {
      code: res.status === 403 || res.status === 401
        ? 'cloudflare_permission_denied'
        : 'cloudflare_api_error',
      httpStatus: res.status,
      providerErrors,
      capabilityId: opts.capabilityId,
      operation,
      path,
      remediation,
    });
  }

  accountPath(suffix) {
    this.requireAccount();
    return `/accounts/${encodeURIComponent(this.accountId)}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
  }

  zonePath(zoneId, suffix) {
    this.requireToken();
    if (!zoneId) {
      throw new CloudflareApiError('zone_id required', { code: 'zone_id_required' });
    }
    return `/zones/${encodeURIComponent(zoneId)}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
  }
}

/** Async factory — OAuth or API token without sync DB work in constructor. */
export async function createCloudflareApiClient(opts = {}) {
  const cred = await resolveCloudflareCredential(opts);
  if (!cred.bearerToken) {
    throw new CloudflareApiError('Cloudflare credential required', {
      code: cred.status === 'token_required' ? 'cloudflare_token_required' : 'cloudflare_authorization_required',
      capabilityId: opts.capabilityId || null,
      remediation: {
        actions: cred.status === 'token_required'
          ? ['Set CLOUDFLARE_API_TOKEN']
          : ['Authorize Cloudflare capability', 'Or set CLOUDFLARE_API_TOKEN'],
        authorize_hint: opts.capabilityId
          ? `/api/connections/cloudflare/start?capabilities=${encodeURIComponent(opts.capabilityId)}`
          : 'agentsam cloudflare status',
        auth_status: cred.status,
      },
    });
  }
  return new CloudflareApiClient({
    apiToken: cred.bearerToken,
    accountId: cred.accountId || opts.explicitAccountId || '',
    authSource: cred.source,
    connectionId: cred.connectionId,
    grantedScopes: cred.grantedScopes,
    capabilityId: opts.capabilityId || null,
    fetchImpl: opts.fetchImpl,
    env: {},
  });
}

export function receipt(capabilityId, action, payload = {}) {
  const cap = getCloudflareCapability(capabilityId);
  const safe = { ...payload };
  delete safe.bearerToken;
  delete safe.apiToken;
  delete safe.accessToken;
  return {
    schema: 'agentsam.cloudflare.receipt.v1',
    provider: 'cloudflare',
    capability_id: capabilityId,
    capability_label: cap?.label || capabilityId,
    action,
    ok: payload.ok !== false,
    auth: payload.auth ? (credentialSafeMeta(payload.auth) || payload.auth) : null,
    ...safe,
  };
}
