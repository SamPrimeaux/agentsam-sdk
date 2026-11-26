/**
 * Identity provider contract — external systems that prove who a person is.
 *
 * Not to be confused with adapters/ (how an app stores identity).
 */

import { normalizeExternalIdentity } from './contracts/external-identity.js';

/**
 * @typedef {Object} NormalizedExternalIdentity
 * @property {string} provider
 * @property {string} subject Provider-scoped stable user id (sub, id, etc.)
 * @property {string|null} email
 * @property {boolean} emailVerified
 * @property {string|null} name
 * @property {string|null} avatar
 * @property {string|null} username
 * @property {Record<string, unknown>|null} [raw]
 */

/**
 * @typedef {Object} OAuthAuthorizeInput
 * @property {string} clientId
 * @property {string} redirectUri
 * @property {string} state
 * @property {string} [codeChallenge]
 * @property {string} [scope]
 */

/**
 * @typedef {Object} OAuthExchangeInput
 * @property {string} code
 * @property {string} codeVerifier
 * @property {string} clientId
 * @property {string} [clientSecret]
 * @property {string} redirectUri
 */

/**
 * @typedef {Object} IdentityProvider
 * @property {string} id
 * @property {(input: OAuthAuthorizeInput) => string} [authorizeUrl]
 * @property {(input: OAuthExchangeInput) => Promise<Record<string, unknown>|null>} [exchangeCode]
 * @property {(accessToken: string) => Promise<Record<string, unknown>|null>} [getProfile]
 * @property {(profile: Record<string, unknown>) => NormalizedExternalIdentity} normalizeIdentity
 */

export function createIdentityProvider(def) {
  if (!def || typeof def !== 'object') {
    throw new Error('identity_provider_definition_required');
  }
  if (!def.id || typeof def.id !== 'string') {
    throw new Error('identity_provider_missing_id');
  }
  if (typeof def.normalizeIdentity !== 'function') {
    throw new Error('identity_provider_normalizeIdentity_must_be_function');
  }
  return Object.freeze({ ...def });
}

export { normalizeExternalIdentity };
