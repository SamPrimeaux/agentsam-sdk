import { normalizeIdentitySession } from '../contracts/session.js';

export { normalizeIdentitySession };

export function trimSessionField(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

/** Portable KV session payload shape (adapter writes to storage). */
export function buildSessionKvPayload(sessionId, fields = {}) {
  return {
    v: 1,
    session_id: sessionId,
    user_id: trimSessionField(fields.userId ?? fields.user_id) ?? null,
    tenant_id: trimSessionField(fields.tenantId ?? fields.tenant_id) ?? null,
    workspace_id: trimSessionField(fields.workspaceId ?? fields.workspace_id) ?? null,
    person_uuid: trimSessionField(fields.personUuid ?? fields.person_uuid) ?? null,
    email: trimSessionField(fields.email) ?? null,
    provider: trimSessionField(fields.provider) ?? null,
    display_name: trimSessionField(fields.displayName ?? fields.display_name) ?? null,
    avatar_url: trimSessionField(fields.avatarUrl ?? fields.avatar_url) ?? null,
    provider_subject: trimSessionField(fields.providerSubject ?? fields.provider_subject) ?? null,
    expires_at: fields.expiresAt ?? fields.expires_at ?? fields.expiresAtIso ?? null,
  };
}

/**
 * @typedef {object} InboundOAuthInput
 * @property {string} provider
 * @property {string} [sessionProvider]
 * @property {string} email
 * @property {string} name
 * @property {string} providerUid
 * @property {string|null} [supabaseUserId]
 * @property {string} source
 * @property {string} [pageContext]
 */

/**
 * @typedef {object} InboundOAuthSuccess
 * @property {true} ok
 * @property {string} authUserId
 * @property {string} sessionId
 * @property {string} sessionToken
 * @property {string|null} tenantId
 */

/**
 * @typedef {object} InboundOAuthFailure
 * @property {false} ok
 * @property {'provision_failed'|'session_failed'} error
 */

/** Result contract for finalizeInboundOAuth */
export function isInboundOAuthSuccess(result) {
  return result?.ok === true && typeof result.authUserId === 'string';
}

/**
 * @typedef {(env: unknown, request: Request, input: InboundOAuthInput) => Promise<InboundOAuthSuccess|InboundOAuthFailure>} InboundOAuthFinalizeFn
 */
