/**
 * Canonical AgentSam identity/auth environment contract.
 *
 * Browser login sessions and reusable API credentials are intentionally
 * separate: login sessions are opaque, machine-local session state while
 * AGENTSAM_API_KEY is an explicit delegated account credential.
 *
 * Namespaces (do not collapse):
 *   PLATFORM issuer  → IAM_OAUTH_ISSUER (account API)
 *   APP host         → agentsam.app.json hosts[] (e.g. local-studio)
 * Never treat Local Studio host origin as an alias of IAM_OAUTH_ISSUER.
 */

export const AGENTSAM_AUTH_ENV = Object.freeze({
  iamIssuer: 'IAM_OAUTH_ISSUER',
  iamOrigin: 'IAM_ORIGIN',
  iamClientId: 'IAM_CLIENT_ID',
  iamClientSecret: 'IAM_CLIENT_SECRET',
  apiKey: 'AGENTSAM_API_KEY',
  bridgeKey: 'AGENTSAM_BRIDGE_KEY',
});

/** PLATFORM account-authority issuer — not an APP host. */
export const PLATFORM_ACCOUNT_ISSUER = 'https://inneranimalmedia.com';

export const AGENTSAM_AUTH_CONTRACT = Object.freeze({
  version: 2,
  authority: 'agentsam-sdk',
  iam: Object.freeze({
    issuer: AGENTSAM_AUTH_ENV.iamIssuer,
    origin: AGENTSAM_AUTH_ENV.iamOrigin,
    clientId: AGENTSAM_AUTH_ENV.iamClientId,
    clientSecret: AGENTSAM_AUTH_ENV.iamClientSecret,
    defaultIssuer: PLATFORM_ACCOUNT_ISSUER,
  }),
  apiKey: Object.freeze({
    env: AGENTSAM_AUTH_ENV.apiKey,
    tokenPrefix: 'aak_',
    authorizationScheme: 'Bearer',
    subject: 'account/delegated',
    durableStore: 'agentsam_api_credentials',
  }),
  browserSession: Object.freeze({
    storage: '~/.agentsam/auth/session.json',
    subject: 'interactive/user',
    reusableApiCredential: false,
  }),
  bridge: Object.freeze({
    env: AGENTSAM_AUTH_ENV.bridgeKey,
    subject: 'machine/integration',
    userAuth: false,
  }),
});

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeOrigin(value) {
  return clean(value).replace(/\/+$/, '');
}

/**
 * Resolve PLATFORM account issuer.
 * Order: explicit → IAM_OAUTH_ISSUER → IAM_ORIGIN → PLATFORM_ACCOUNT_ISSUER.
 * Does not read APP host origins.
 */
export function resolveIamIssuer(env = {}, explicit = '') {
  return normalizeOrigin(explicit || env?.IAM_OAUTH_ISSUER || env?.IAM_ORIGIN || '')
    || PLATFORM_ACCOUNT_ISSUER;
}

/** @deprecated Use resolveIamIssuer. Same resolution order as issuer. */
export function resolveIamOrigin(env = {}, explicit = '') {
  return resolveIamIssuer(env, explicit);
}

/** Resolve the reusable delegated account API credential. */
export function resolveApiKey(env = {}, explicit = '') {
  return clean(explicit || env?.AGENTSAM_API_KEY);
}

/** Resolve machine/integration bridge credential. No account API-key alias is accepted. */
export function resolveBridgeKey(env = {}, explicit = '') {
  return clean(explicit || env?.AGENTSAM_BRIDGE_KEY);
}

export function isApiKey(value) {
  return clean(value).startsWith(AGENTSAM_AUTH_CONTRACT.apiKey.tokenPrefix);
}

/** Build the public bearer header for an AgentSam account API key. */
export function buildApiAuthorizationHeaders(key, headers = {}) {
  const resolved = clean(key);
  if (!isApiKey(resolved)) throw new Error('AGENTSAM_API_KEY_required');
  return {
    ...headers,
    Authorization: `Bearer ${resolved}`,
  };
}
