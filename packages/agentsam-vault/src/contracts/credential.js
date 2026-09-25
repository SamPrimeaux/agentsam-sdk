/**
 * Portable AgentSam credential / vault contracts.
 * Secrets never live on CredentialRecord — only credential_ref.
 */

/**
 * @typedef {'user'|'account'|'app'} CredentialOwnerType
 * @typedef {'provider_api_key'|'oauth_connection'|'agentsam_api_key'|'app_secret'} CredentialKind
 * @typedef {'active'|'expired'|'revoked'|'invalid'} CredentialStatus
 */

/**
 * @typedef {object} CredentialRecord
 * @property {string} id
 * @property {CredentialOwnerType} owner_type
 * @property {string} owner_id
 * @property {CredentialKind} kind
 * @property {string} [provider]
 * @property {string} label
 * @property {string} credential_ref
 * @property {CredentialStatus} status
 * @property {string[]} [capabilities]
 * @property {string[]} [granted_scopes]
 * @property {string|null} [expires_at]
 * @property {string|null} [validated_at]
 * @property {string|null} [last_used_at]
 * @property {string|null} [rotated_at]
 * @property {string} [last4]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {object} CredentialProviderField
 * @property {string} id
 * @property {'secret'|'text'|'url'} type
 * @property {boolean} [required]
 * @property {string} [label]
 */

/**
 * @typedef {object} CredentialProviderDefinition
 * @property {string} id
 * @property {string} label
 * @property {{ kind: CredentialKind, sensitive?: boolean }} credential
 * @property {CredentialProviderField[]} fields
 * @property {string[]} [capabilities]
 * @property {{ test?: boolean, rotate?: boolean, revoke?: boolean }} [operations]
 */

export const CREDENTIAL_KINDS = Object.freeze({
  PROVIDER_API_KEY: 'provider_api_key',
  OAUTH_CONNECTION: 'oauth_connection',
  AGENTSAM_API_KEY: 'agentsam_api_key',
  APP_SECRET: 'app_secret',
});

export const CREDENTIAL_STATUSES = Object.freeze({
  ACTIVE: 'active',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
  INVALID: 'invalid',
});

/**
 * Authority lanes — do not conflate.
 *
 * VAULT_MASTER_KEY     encrypts BYOK / app secrets at rest (per Worker/app)
 * AGENTSAM_API_KEY     aak_* delegated account API credential (IAM verifies hash)
 * AGENTSAM_BRIDGE_KEY  machine↔Worker service auth (not a user credential)
 * browser_oauth        interactive session cookie (not reusable API key)
 */
export const CREDENTIAL_AUTHORITY = Object.freeze({
  vaultMasterKey: 'VAULT_MASTER_KEY',
  agentsamApiKey: 'AGENTSAM_API_KEY',
  agentsamApiKeyPrefix: 'aak_',
  agentsamApiKeyStore: 'agentsam_api_credentials',
  bridgeKey: 'AGENTSAM_BRIDGE_KEY',
});

/**
 * @param {Partial<CredentialRecord> & Pick<CredentialRecord,'id'|'owner_type'|'owner_id'|'kind'|'label'|'credential_ref'|'status'|'created_at'|'updated_at'>} input
 * @returns {CredentialRecord}
 */
export function normalizeCredentialRecord(input) {
  if (!input?.id || !input.credential_ref) {
    throw new Error('credential_record_requires_id_and_ref');
  }
  if (typeof input.credential_ref === 'string' && /^(sk-|sk_live_|AIza|ghp_|cf_|aak_)/i.test(input.credential_ref)) {
    throw new Error('credential_ref_must_not_be_plaintext_secret');
  }
  return Object.freeze({
    id: String(input.id),
    owner_type: input.owner_type,
    owner_id: String(input.owner_id),
    kind: input.kind,
    provider: input.provider ? String(input.provider) : undefined,
    label: String(input.label || input.provider || input.kind),
    credential_ref: String(input.credential_ref),
    status: input.status || CREDENTIAL_STATUSES.ACTIVE,
    capabilities: Array.isArray(input.capabilities) ? [...input.capabilities] : undefined,
    granted_scopes: Array.isArray(input.granted_scopes) ? [...input.granted_scopes] : undefined,
    expires_at: input.expires_at ?? null,
    validated_at: input.validated_at ?? null,
    last_used_at: input.last_used_at ?? null,
    rotated_at: input.rotated_at ?? null,
    last4: input.last4 || undefined,
    created_at: String(input.created_at),
    updated_at: String(input.updated_at),
  });
}

/**
 * @param {CredentialProviderDefinition} def
 */
export function defineCredentialProvider(def) {
  if (!def?.id || !def?.label || !def?.credential?.kind) {
    throw new Error('invalid_credential_provider');
  }
  return Object.freeze({
    id: def.id,
    label: def.label,
    credential: Object.freeze({ ...def.credential }),
    fields: Object.freeze((def.fields || []).map((f) => Object.freeze({ ...f }))),
    capabilities: Object.freeze([...(def.capabilities || [])]),
    operations: Object.freeze({
      test: def.operations?.test !== false,
      rotate: Boolean(def.operations?.rotate),
      revoke: def.operations?.revoke !== false,
    }),
  });
}
