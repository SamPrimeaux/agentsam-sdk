/**
 * Email + password provider scaffold.
 * Sprint 2: normalization contract only — hashing/verification stays in IAM adapter for now.
 */
import { createIdentityProvider } from '../../provider-contract.js';
import { normalizeExternalIdentity } from '../../contracts/external-identity.js';

/**
 * @param {{ email: string, emailVerified?: boolean, userId?: string }} input
 */
export function normalizeEmailIdentity(input) {
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  const subject = input?.userId != null ? String(input.userId) : email;
  if (!email && !subject) {
    throw new Error('email_identity_requires_email_or_user_id');
  }
  return normalizeExternalIdentity({
    provider: 'email',
    subject,
    email: email || null,
    emailVerified: input?.emailVerified === true,
    name: null,
    avatar: null,
    raw: input,
  });
}

async function verifyEmailPassword(_input) {
  throw new Error('email_provider_verify_not_implemented');
}

export const EmailProvider = createIdentityProvider({
  id: 'email',
  normalizeIdentity(profile) {
    return normalizeEmailIdentity(profile);
  },
});

export { verifyEmailPassword };
