import { normalizeExternalIdentity } from '../../contracts/external-identity.js';

/** @param {Record<string, unknown>} profile */
export function normalizeGoogleIdentity(profile) {
  const subject =
    profile?.sub != null
      ? String(profile.sub)
      : profile?.id != null
        ? String(profile.id)
        : '';

  const email = typeof profile?.email === 'string' ? profile.email.trim().toLowerCase() : null;
  const emailVerified =
    profile?.email_verified === true || profile?.verified_email === true;

  const name =
    typeof profile?.name === 'string'
      ? profile.name.trim()
      : [profile?.given_name, profile?.family_name].filter(Boolean).join(' ').trim() || null;

  const avatar = typeof profile?.picture === 'string' ? profile.picture : null;

  return normalizeExternalIdentity({
    provider: 'google',
    subject,
    email,
    emailVerified,
    name,
    avatar,
    raw: profile,
  });
}
