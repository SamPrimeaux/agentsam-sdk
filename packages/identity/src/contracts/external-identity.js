/**
 * Portable external identity shape — storage-agnostic.
 * Adapters map this into application-specific account_identities rows.
 */

/** @typedef {import('../provider-contract.js').NormalizedExternalIdentity} NormalizedExternalIdentity */

/**
 * @param {Partial<NormalizedExternalIdentity> & { provider: string; subject: string }} input
 * @returns {NormalizedExternalIdentity}
 */
export function normalizeExternalIdentity(input) {
  const provider = String(input?.provider || '').trim().toLowerCase();
  const subject = String(input?.subject || '').trim();
  if (!provider || !subject) {
    throw new Error('external_identity_requires_provider_and_subject');
  }

  const email =
    typeof input?.email === 'string' && input.email.trim()
      ? input.email.trim().toLowerCase()
      : null;

  return {
    provider,
    subject,
    email,
    emailVerified: input?.emailVerified === true,
    name: typeof input?.name === 'string' && input.name.trim() ? input.name.trim() : null,
    avatar: typeof input?.avatar === 'string' && input.avatar.trim() ? input.avatar.trim() : null,
    username:
      typeof input?.username === 'string' && input.username.trim() ? input.username.trim() : null,
    raw: input?.raw && typeof input.raw === 'object' ? input.raw : null,
  };
}
