/**
 * Cloudflare account connector (not an identity provider).
 * Answers: what Cloudflare account has this authenticated AgentSam user authorized?
 */

export const CLOUDFLARE_OAUTH_AUTHORIZE_URL = 'https://dash.cloudflare.com/oauth2/auth';
export const CLOUDFLARE_OAUTH_TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token';
export const CLOUDFLARE_CALLBACK_PATH = '/api/connections/cloudflare/callback';
export const CLOUDFLARE_FIXTURE_CLIENT_ID = 'sillynotreal';
export const CLOUDFLARE_FIXTURE_CLIENT_SECRET = 'sillynotreal-secret';

export const CLOUDFLARE_OAUTH_REVOKE_URL = 'https://dash.cloudflare.com/oauth2/revoke';

/** Smallest useful scopes mapped to Cloudflare API token permission names. */
export const CLOUDFLARE_CAPABILITY_SCOPES = Object.freeze({
  workers_deploy: {
    scopes: ['workers-scripts.write'],
    why: 'Deploy Workers for the connected account (Workers Scripts Edit).',
  },
  d1_inspect: {
    scopes: ['d1.read'],
    why: 'Inspect D1 databases bound to the deployable.',
  },
  r2_inspect: {
    scopes: ['workers-r2-storage.read'],
    why: 'Inspect R2 buckets bound to the deployable.',
  },
  worker_logs: {
    scopes: ['workers-scripts.read'],
    why: 'Read Worker script metadata/logs for postdeploy health.',
  },
});

export function requestedCloudflareScopes() {
  const set = new Set();
  for (const cap of Object.values(CLOUDFLARE_CAPABILITY_SCOPES)) {
    for (const scope of cap.scopes) set.add(scope);
  }
  return [...set];
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function isFixtureCloudflareCredential(value) {
  const v = clean(value);
  return v === CLOUDFLARE_FIXTURE_CLIENT_ID || v === CLOUDFLARE_FIXTURE_CLIENT_SECRET;
}

export function resolveCloudflareOAuthClient(env = {}) {
  const clientId = clean(env.CLOUDFLARE_OAUTH_CLIENT_ID);
  const clientSecret = clean(env.CLOUDFLARE_OAUTH_CLIENT_SECRET);
  const present = Boolean(clientId && clientSecret);
  const fixture = isFixtureCloudflareCredential(clientId) || isFixtureCloudflareCredential(clientSecret);
  if (!present) {
    return {
      configured: false,
      productionReady: false,
      fixture: false,
      status: 'not_configured',
      clientIdConfigured: Boolean(clientId),
      secretConfigured: Boolean(clientSecret),
    };
  }
  return {
    configured: true,
    productionReady: !fixture,
    fixture,
    status: fixture ? 'fixture' : 'ready',
    clientIdConfigured: true,
    secretConfigured: true,
  };
}

export function cloudflareConnectionSafeStatus(env = {}, connection = null, ownerId = '') {
  const client = resolveCloudflareOAuthClient(env);
  const record = connection && connection.ownerId === ownerId ? connection : null;
  return {
    provider: 'cloudflare',
    status: record ? 'connected' : client.status === 'ready' ? 'ready' : client.status,
    configured: client.configured && client.productionReady,
    fixture: client.fixture,
    clientId: client.clientIdConfigured ? 'configured' : 'missing',
    secret: client.secretConfigured ? 'configured' : 'missing',
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
