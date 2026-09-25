/**
 * Portable IdentityStore contract.
 * Adapters (SQLite, D1, Postgres) implement this — the identity service never
 * imports Cloudflare/D1 APIs directly for product logic.
 */

/**
 * @typedef {object} IdentityUser
 * @property {string} id
 * @property {string} email
 * @property {string|null} [display_name]
 * @property {string|null} [password_hash]
 * @property {string|null} [salt]
 * @property {string} [status]
 * @property {number} created_at
 * @property {number} updated_at
 */

/**
 * @typedef {object} IdentitySession
 * @property {string} id
 * @property {string} user_id
 * @property {string|null} [email]
 * @property {string|null} [provider]
 * @property {string|null} [provider_subject]
 * @property {string|null} [display_name]
 * @property {number} expires_at
 * @property {number|null} [revoked_at]
 * @property {number} created_at
 * @property {number|null} [last_active_at]
 */

/**
 * @typedef {object} OAuthTransaction
 * @property {string} state
 * @property {string} provider
 * @property {string} code_verifier
 * @property {string|null} [return_to]
 * @property {string} app_id
 * @property {number} expires_at
 * @property {number} created_at
 * @property {number|null} [consumed_at]
 */

/**
 * @typedef {object} AuthEventInput
 * @property {string} [userId]
 * @property {string} [accountId]
 * @property {string} eventType
 * @property {string} [status]
 * @property {string} [provider]
 * @property {object} [session]
 * @property {object} [capabilities]
 * @property {object} [activity]
 * @property {object} [client]
 * @property {object} [metadata]
 * @property {Request} [request]
 */

/**
 * @typedef {object} IdentityStore
 * @property {number} schemaVersion
 * @property {(email: string) => Promise<IdentityUser|null>} findUserByEmail
 * @property {(userId: string) => Promise<IdentityUser|null>} findUserById
 * @property {(input: { email: string, passwordHash?: string|null, salt?: string|null, displayName?: string|null }) => Promise<IdentityUser>} createUser
 * @property {(userId: string, passwordHash: string, salt: string) => Promise<void>} updateUserPassword
 * @property {(provider: string, providerSubject: string) => Promise<IdentityUser|null>} findUserByProvider
 * @property {(input: { accountId: string, provider: string, providerSubject: string, email?: string|null }) => Promise<string>} upsertProviderIdentity
 * @property {(input: { userId: string, email?: string|null, provider?: string, providerSubject?: string|null, displayName?: string|null }) => Promise<IdentitySession>} createSession
 * @property {(sessionId: string) => Promise<IdentitySession|null>} getSession
 * @property {(sessionId: string, reason?: string) => Promise<{ ok: true, reason: string }>} revokeSession
 * @property {(input: { state: string, provider: string, codeVerifier: string, returnTo?: string|null, appId: string, ttlSeconds?: number }) => Promise<void>} createOAuthTransaction
 * @property {(state: string) => Promise<OAuthTransaction|null>} consumeOAuthTransaction
 * @property {(input: AuthEventInput) => Promise<void>} logAuthEvent
 * @property {(userId: string) => Promise<{ loginCount: number, activeSessionCount: number, lastLoginAt: number|null }>} [countAuthActivity]
 */

export const IDENTITY_STORE_SCHEMA_VERSION = 1;

export const IDENTITY_PACKS = Object.freeze({
  CORE: 'identity.core',
  OAUTH_CLIENT: 'identity.oauth-client',
  OAUTH_SERVER: 'identity.oauth-server',
});

/**
 * Structured routing / schema failures — never silently redirect to "/".
 */
export class IdentityRoutingError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details = {}) {
    super(message || code);
    this.name = 'IdentityRoutingError';
    this.code = code;
    this.details = details;
  }
}

export class IdentitySchemaError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details = {}) {
    super(message || code);
    this.name = 'IdentitySchemaError';
    this.code = code;
    this.details = details;
  }
}
