import { normalizeExternalIdentity } from '../../contracts/external-identity.js';

/** @param {Record<string, unknown>} profile */
export function normalizeIamIdentity(profile) {
  const subject =
    profile?.sub != null
      ? String(profile.sub)
      : profile?.user_id != null
        ? String(profile.user_id)
        : '';

  const email = typeof profile?.email === 'string' ? profile.email.trim().toLowerCase() : null;
  const emailVerified = profile?.email_verified === true;

  const name = typeof profile?.name === 'string' ? profile.name.trim() : null;

  return normalizeExternalIdentity({
    provider: 'iam',
    subject,
    email,
    emailVerified,
    name,
    avatar: null,
    raw: profile,
  });
}
