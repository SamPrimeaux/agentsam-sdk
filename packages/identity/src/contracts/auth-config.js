/**
 * Canonical AgentSam identity/auth environment contract.
 *
 * The SDK owns these public names. Host applications consume this contract and
 * may provide storage/verification adapters without inventing competing aliases.
 *
 * Canonical variables:
 *   IAM_ORIGIN            IAM authority + browser/OAuth/API origin
 *   IAM_CLIENT_ID         OAuth client id
 *   IAM_CLIENT_SECRET     OAuth client secret
 *   AGENTSAM_SDK_KEY      account/delegated sdk_* bearer
 *   AGENTSAM_BRIDGE_KEY   machine/integration credential
 *
 * Migration-only fallbacks:
 *   IAM_OAUTH_ISSUER      -> IAM_ORIGIN
 *   AGENTSAM_SDK_TOKEN    -> AGENTSAM_SDK_KEY
 */

export const DEFAULT_IAM_ORIGIN = 'https://inneranimalmedia.com';

export const AGENTSAM_AUTH_ENV = Object.freeze({
  iamOrigin: 'IAM_ORIGIN',
  iamClientId: 'IAM_CLIENT_ID',
  iamClientSecret: 'IAM_CLIENT_SECRET',
  sdkKey: 'AGENTSAM_SDK_KEY',
  bridgeKey: 'AGENTSAM_BRIDGE_KEY',
});

export const AGENTSAM_AUTH_LEGACY_ENV = Object.freeze({
  iamOrigin: 'IAM_OAUTH_ISSUER',
  sdkKey: 'AGENTSAM_SDK_TOKEN',
});

export const AGENTSAM_AUTH_CONTRACT = Object.freeze({
  version: 1,
  authority: 'agentsam-sdk',
  iam: Object.freeze({
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
    sdkKeyFallback: AGENTSAM_AUTH_LEGACY_ENV.sdkKey,
  }),
});

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeOrigin(value) {
  return clean(value).replace(/\/+$/, '');
}

/** Resolve canonical IAM authority origin with one migration fallback. */
export function resolveIamOrigin(env = {}, explicit = '') {
  return normalizeOrigin(
    explicit || env?.IAM_ORIGIN || env?.IAM_OAUTH_ISSUER || DEFAULT_IAM_ORIGIN,
  );
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
