/**
 * Cloudflare account connector (not an identity provider).
 * Answers: what Cloudflare account has this authenticated AgentSam user authorized?
 */

export const CLOUDFLARE_OAUTH_AUTHORIZE_URL = 'https://dash.cloudflare.com/oauth2/auth';
export const CLOUDFLARE_OAUTH_TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token';
export const CLOUDFLARE_CALLBACK_PATH = '/api/connections/cloudflare/callback';
export const CLOUDFLARE_FIXTURE_CLIENT_ID = 'sillynotreal';

export const CLOUDFLARE_OAUTH_REVOKE_URL = 'https://dash.cloudflare.com/oauth2/revoke';

export {
  CLOUDFLARE_BASELINE_SCOPES,
  CLOUDFLARE_CAPABILITIES,
  CLOUDFLARE_CAPABILITY_SCOPES,
  CLOUDFLARE_FEATURE_PACKS,
  listCloudflareCapabilities,
  listCloudflareFeaturePacks,
  getCloudflareCapability,
  getCloudflareFeaturePack,
  scopesForCapabilities,
  scopesForFeaturePacks,
  assessCapabilityAuthorization,
  capabilityAuthorizationMatrix,
  cloudflarePermissionRemediation,
} from './capabilities.js';

export {
  upsertCloudflareUserOauthToken,
  revokeCloudflareUserOauthTokens,
  resolveCloudflareAccountId,
  unionScopes,
} from './oauth-persist.js';

export {
  CloudflareApiClient,
  CloudflareApiError,
  resolveCloudflareApiAuth,
  createCloudflareApiClient,
  receipt as cloudflareReceipt,
} from './api-client.js';

export {
  resolveCloudflareCredential,
  credentialSafeMeta,
  loadCloudflareFromUserOauthTokens,
  loadCloudflareFromLegacyConnections,
  loadCloudflareConnectionRecord,
  mapCloudflareOauthRowToConnection,
} from './credential.js';

export * as workflows from './families/workflows.js';
export * as scanner from './families/scanner.js';
export * as tags from './families/tags.js';
export * as tagGateway from './families/tag-gateway.js';
export * as brandProtection from './families/brand-protection.js';
export * as keyless from './families/keyless.js';
export * as tokenValidation from './families/token-validation.js';
export * as pages from './families/pages.js';
export * as snippets from './families/snippets.js';

import { scopesForCapabilities as _scopesForCapabilities, scopesForFeaturePacks as _scopesForFeaturePacks } from './capabilities.js';

// Full scope catalog kept as REFERENCE ONLY — never request wholesale at mint.
export const CLOUDFLARE_ALL_SCOPES = Object.freeze([
  'agent-memory.write',
  'browser-rendering.read',
  'browser-rendering.write',
  'cf-agents.read',
  'cf-agents.write',
  'cloud-connector.read',
  'cloud-connector.write',
  'cloudchamber.read',
  'cloudchamber.write',
  'constellation.read',
  'constellation.write',
  'd1.read',
  'd1.write',
  'flagship.evaluate',
  'flagship.read',
  'flagship.write',
  'query-cache.read',
  'query-cache.write',
  'k2.read',
  'k2.write',
  'k2.consume',
  'k2.produce',
  'mcp-portals.read',
  'mcp-portals.write',
  'messaging.edit',
  'messaging.read',
  'cfspeed.read',
  'cfspeed.write',
  'page.read',
  'page.write',
  'pipelines.read',
  'pipelines.send',
  'pipelines.write',
  'pubsub.read',
  'pubsub.write',
  'queues.read',
  'queues.write',
  'realtime.write',
  'realtime.admin',
  'realtime.read',
  'secrets-store.read',
  'secrets-store.write',
  'vectorize.read',
  'vectorize.write',
  'workers-ci.read',
  'workers-ci.write',
  'containers.read',
  'containers.write',
  'workers-kv-storage.read',
  'workers-kv-storage.write',
  'workers-observability.read',
  'workers-observability-telemetry.write',
  'workers-observability.write',
  'r2-catalog.read',
  'r2-catalog.write',
  'r2-catalog-sql.read',
  'workers-r2-bucket-item.read',
  'workers-r2-bucket-item.write',
  'workers-r2.read',
  'workers-r2.write',
  'workers-routes.read',
  'workers-routes.write',
  'workers-scripts.read',
  'workers-scripts.write',
  'workers-tail.read',
  'aiaudit.read',
  'aiaudit.write',
  'aig.read',
  'aig.run',
  'aig.write',
  'ai-search.index',
  'ai-search.read',
  'ai-search.run',
  'ai-search.write',
  'agw.read',
  'agw.run',
  'agw.write',
  'rag.read',
  'rag.write',
  'rag.run',
  'firewall-for-ai.read',
  'firewall-for-ai.write',
  'websearch.read',
  'websearch.run',
  'websearch.write',
  'ai-model.read',
  'ai-model.write',
  'ai.read',
  'ai.write',
  'account-dns-settings.read',
  'account-dns-settings.write',
  'dns-firewall.read',
  'dns-firewall.write',
  'dns.read',
  'dns-view.read',
  'dns-view.write',
  'dns.write',
  'registrar-domains.admin',
  'registrar-domains.read',
  'registrar-sandbox-domains.admin',
  'registrar-sandbox-domains.read',
  'zone-custom-asset.read',
  'zone-custom-asset.write',
  'zone-dns-settings.read',
  'zone-dns-settings.write',
  'zone.read',
  'zone-settings.read',
  'zone-settings.write',
  'zone-versioning.read',
  'zone-versioning.write',
  'zone.write',
  'fraud-detection-pii.read',
  'account-firewall-access-rules.read',
  'account-firewall-access-rules.write',
  'account-security-center-insights.read',
  'account-security-center-insights.write',
  'account-waf.read',
  'account-waf.write',
  'request-tracer.read',
  'reports-application-security-report.read',
  'bot-management-feedback.read',
  'bot-management-feedback.write',
  'bot-management.read',
  'bot-management.write',
  'http-applications.read',
  'http-applications.write',
  'http-ddos-managed-ruleset.read',
  'http-ddos-managed-ruleset.write',
  'tag.read',
  'tag.write',
  'url-scanner.read',
  'url-scanner.write',
  'zone-security-center-insights.read',
  'zone-security-center-insights.write',
  'zone-waf.read',
  'zone-waf.write',
  'account-custom-error-rules.read',
  'account-custom-error-rules.write',
  'account-custom-pages.read',
  'account-custom-pages.write',
  'account-rule-lists.read',
  'account-rule-lists.write',
  'account-rulesets.read',
  'account-rulesets.write',
  'config-settings.read',
  'config-settings.write',
  'custom-errors.read',
  'custom-errors.write',
  'custom-pages.read',
  'custom-pages.write',
  'dynamic-redirect.read',
  'dynamic-redirect.write',
  'managed-headers.read',
  'managed-headers.write',
  'mass-url-redirects.read',
  'mass-url-redirects.write',
  'origin.read',
  'origin.write',
  'payments-gateway.read',
  'payments-gateway.write',
  'account-ssl-and-certificates.read',
  'account-ssl-and-certificates.write',
  'cache.purge',
  'cache-settings.read',
  'cache-settings.write',
  'ssl-and-certificates.read',
  'ssl-and-certificates.write',
  'account-api-gateway.write',
  'account-api-gateway.read',
  'account-custom-asset.read',
  'account-custom-asset.write',
  'account-settings.read',
  'account-settings.write',
  'apps.write',
  'integration.write',
  'memberships.read',
  'memberships.write',
  'notifications.read',
  'notifications.write',
  'scim-provisioning.write',
  'user-details.read',
  'offline_access'
]);

/**
 * Scopes requested at OAuth mint / re-authorize.
 * Default: baseline only. Pass `capabilities` and/or `packs` to upgrade deliberately.
 * Host apps supply their own default capability list — this package does not.
 * Pass `{ all: true }` only for catalog dumps — never for live authorize URLs.
 * @param {{ capabilities?: string[], packs?: string[], all?: boolean }} [opts]
 */
export function requestedCloudflareScopes(opts = {}) {
  if (opts && opts.all === true) return [...CLOUDFLARE_ALL_SCOPES];
  const capabilities = Array.isArray(opts?.capabilities) ? opts.capabilities.filter(Boolean) : [];
  const packs = Array.isArray(opts?.packs) ? opts.packs.filter(Boolean) : [];
  if (packs.length) {
    return _scopesForFeaturePacks(packs, capabilities);
  }
  return _scopesForCapabilities({
    capabilities,
    includeBaseline: true,
    generallyAvailableOnly: true,
  });
}


function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function isFixtureCloudflareCredential(value) {
  const v = clean(value);
  return v === CLOUDFLARE_FIXTURE_CLIENT_ID;
}

export function resolveCloudflareOAuthClient(env = {}) {
  const clientId = clean(env.CLOUDFLARE_OAUTH_CLIENT_ID);
  // AgentSam Local Studio uses Cloudflare's public PKCE client. It must never
  // read a client secret: stale Worker secrets would turn an otherwise valid
  // PKCE exchange into an invalid mixed-auth request. Confidential Cloudflare
  // clients belong to their owning host adapter, not this connector.
  const present = Boolean(clientId);
  const fixture = isFixtureCloudflareCredential(clientId);
  if (!present) {
    return {
      configured: false,
      productionReady: false,
      fixture: false,
      status: 'not_configured',
      clientIdConfigured: Boolean(clientId),
      tokenAuthMethod: 'none_pkce',
    };
  }
  return {
    configured: true,
    productionReady: !fixture,
    fixture,
    status: fixture ? 'fixture' : 'ready',
    clientIdConfigured: true,
    tokenAuthMethod: 'none_pkce',
  };
}

export function cloudflareConnectionSafeStatus(env = {}, connection = null, ownerId = '') {
  const client = resolveCloudflareOAuthClient(env);
  const record = connection && connection.ownerId === ownerId && connection.status === 'connected' ? connection : null;
  return {
    provider: 'cloudflare',
    status: record ? 'connected' : client.status === 'ready' ? 'ready' : client.status,
    configured: client.configured && client.productionReady,
    fixture: client.fixture,
    clientId: client.clientIdConfigured ? 'configured' : 'missing',
    token_auth_method: client.tokenAuthMethod,
    callbackPath: CLOUDFLARE_CALLBACK_PATH,
    connection: record
      ? {
          connection_id: record.connectionId,
          owner: record.ownerId,
          cloudflare_account_id: record.cloudflareAccountId || null,
          scopes: record.scopes || [],
          status: record.status,
          created_at: record.createdAt,
          updated_at: record.updatedAt,
          expires_at: record.expiresAt || null,
        }
      : null,
  };
}

export function assertConnectionOwner(connection, ownerId) {
  if (!ownerId) {
    const err = new Error('unauthenticated');
    err.code = 'unauthenticated';
    throw err;
  }
  if (!connection || connection.ownerId !== ownerId) {
    const err = new Error('cloudflare_connection_forbidden');
    err.code = 'cloudflare_connection_forbidden';
    throw err;
  }
  return connection;
}

/**
 * LEGACY dual-read wrapper — now SSOT-only via user_oauth_tokens.
 * Prefer resolveCloudflareCredential / createCloudflareApiClient.
 */
export async function loadCloudflareAccessToken(env, ownerId, options = {}) {
  const { resolveCloudflareCredential } = await import('./credential.js');
  const cred = await resolveCloudflareCredential({
    env,
    ownerId,
    authMode: 'oauth',
    decryptUserOauthToken: options.decryptUserOauthToken,
    ...options,
  });
  if (!cred?.bearerToken) return null;
  return {
    accessToken: cred.bearerToken,
    connectionId: cred.connectionId,
    accountId: cred.accountId,
    scopes: cred.grantedScopes || [],
    expiresAt: cred.expiresAt,
    source: cred.source,
  };
}

export async function probeCloudflareConnection(env, ownerId, options = {}) {
  const startedAt = Date.now();
  const checkedAt = Math.floor(startedAt / 1000);
  try {
    const connection = await loadCloudflareAccessToken(env, ownerId, options);
    if (!connection) return { status: 'auth_error', healthy: false, checked_at: checkedAt, error_code: 'cloudflare_connection_missing' };
    const response = await (options.fetchImpl || fetch)('https://dash.cloudflare.com/oauth2/userinfo', {
      headers: { authorization: `Bearer ${connection.accessToken}`, accept: 'application/json' },
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(5000) : undefined,
    });
    const body = await response.json().catch(() => null);
    const healthy = response.ok && body?.error == null;
    return {
      status: healthy ? 'healthy' : response.status === 401 || response.status === 403 ? 'auth_error' : 'unhealthy',
      healthy,
      checked_at: checkedAt,
      latency_ms: Date.now() - startedAt,
      http_status: response.status,
      provider_request_id: response.headers.get('cf-ray') || null,
      account_id: connection.accountId,
      scopes: connection.scopes,
      error_code: healthy
        ? null
        : body?.error || (body?.errors?.[0]?.code ? String(body.errors[0].code) : `cloudflare_http_${response.status}`),
      error_message: healthy ? null : body?.error_description || body?.errors?.[0]?.message || 'Cloudflare OAuth probe failed',
    };
  } catch (error) {
    return {
      status: 'unreachable', healthy: false, checked_at: checkedAt, latency_ms: Date.now() - startedAt,
      error_code: 'cloudflare_probe_failed', error_message: String(error?.message || error).slice(0, 240),
    };
  }
}

export function buildAuthorizeUrl({ clientId, redirectUri, state, codeChallenge, scopes }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: (scopes || requestedCloudflareScopes()).join(' '),
  });
  return `${CLOUDFLARE_OAUTH_AUTHORIZE_URL}?${params}`;
}
