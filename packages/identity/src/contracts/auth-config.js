/**
 * Canonical AgentSam identity/auth environment contract.
 *
 * The SDK owns these public names. Host applications consume this contract and
 * may provide storage/verification adapters without inventing competing aliases.
 *
 * Canonical variables:
 *   IAM_OAUTH_ISSUER      public authorization-server authority (issuer)
 *   IAM_CLIENT_ID         OAuth client id
 *   IAM_CLIENT_SECRET     OAuth client secret
 *   IAM_ORIGIN            deprecated alias of IAM_OAUTH_ISSUER (migration window)
 *   AGENTSAM_SDK_KEY      account/delegated sdk_* bearer
 *   AGENTSAM_BRIDGE_KEY   machine/integration credential
 *
 * Migration-only fallbacks:
 *   IAM_ORIGIN            -> IAM_OAUTH_ISSUER
 *   AGENTSAM_SDK_TOKEN    -> AGENTSAM_SDK_KEY
 */

export const DEFAULT_IAM_OAUTH_ISSUER = 'https://inneranimalmedia.com';
/** @deprecated Use DEFAULT_IAM_OAUTH_ISSUER. */
export const DEFAULT_IAM_ORIGIN = DEFAULT_IAM_OAUTH_ISSUER;

export const AGENTSAM_AUTH_ENV = Object.freeze({
  iamIssuer: 'IAM_OAUTH_ISSUER',
  iamOrigin: 'IAM_ORIGIN',
  iamClientId: 'IAM_CLIENT_ID',
  iamClientSecret: 'IAM_CLIENT_SECRET',
  sdkKey: 'AGENTSAM_SDK_KEY',
  bridgeKey: 'AGENTSAM_BRIDGE_KEY',
});

export const AGENTSAM_AUTH_LEGACY_ENV = Object.freeze({
  iamOrigin: 'IAM_ORIGIN',
  sdkKey: 'AGENTSAM_SDK_TOKEN',
});

export const AGENTSAM_AUTH_CONTRACT = Object.freeze({
  version: 1,
  authority: 'agentsam-sdk',
  iam: Object.freeze({
    issuer: AGENTSAM_AUTH_ENV.iamIssuer,
    origin: AGENTSAM_AUTH_ENV.iamOrigin,
    clientId: AGENTSAM_AUTH_ENV.iamClientId,
    clientSecret: AGENTSAM_AUTH_ENV.iamClientSecret,
  }),
  sdk: Object.freeze({
    env: AGENTSAM_AUTH_ENV.sdkKey,
    tokenPrefix: 'sdk_',
    authorizationScheme: 'Bearer',
    subject: 'account/delegated',
    durableStore: 'agentsam_sdk_tokens',
  }),
  bridge: Object.freeze({
    env: AGENTSAM_AUTH_ENV.bridgeKey,
    subject: 'machine/integration',
    sdkTokenType: 'integration',
    userAuth: false,
  }),
  compatibility: Object.freeze({
    iamOriginFallback: AGENTSAM_AUTH_LEGACY_ENV.iamOrigin,
    iamIssuerCanonical: AGENTSAM_AUTH_ENV.iamIssuer,
    sdkKeyFallback: AGENTSAM_AUTH_LEGACY_ENV.sdkKey,
  }),
});

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeOrigin(value) {
  return clean(value).replace(/\/+$/, '');
}

/** Resolve canonical IAM issuer. IAM_OAUTH_ISSUER wins; IAM_ORIGIN is compatibility only. */
export function resolveIamIssuer(env = {}, explicit = '') {
  return normalizeOrigin(
    explicit || env?.IAM_OAUTH_ISSUER || env?.IAM_ORIGIN || DEFAULT_IAM_OAUTH_ISSUER,
  );
}

/** @deprecated Use resolveIamIssuer. Same resolution order as issuer. */
export function resolveIamOrigin(env = {}, explicit = '') {
  return resolveIamIssuer(env, explicit);
}

/** Resolve account/delegated SDK bearer; canonical name wins over legacy. */
export function resolveSdkKey(env = {}, explicit = '') {
  return clean(explicit || env?.AGENTSAM_SDK_KEY || env?.AGENTSAM_SDK_TOKEN);
}

/** Resolve machine/integration bridge credential. No user-SDK alias is accepted. */
export function resolveBridgeKey(env = {}, explicit = '') {
  return clean(explicit || env?.AGENTSAM_BRIDGE_KEY);
}

export function isSdkKey(value) {
  return clean(value).startsWith(AGENTSAM_AUTH_CONTRACT.sdk.tokenPrefix);
}

/** Build the public bearer header for an SDK key. */
export function buildSdkAuthorizationHeaders(key, headers = {}) {
  const resolved = clean(key);
  if (!isSdkKey(resolved)) throw new Error('AGENTSAM_SDK_KEY_required');
  return {
    ...headers,
    Authorization: `Bearer ${resolved}`,
  };
}
