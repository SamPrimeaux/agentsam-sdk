import { normalizeExternalIdentity } from '../../contracts/external-identity.js';

/** @param {Record<string, unknown>} profile */
export function normalizeGithubIdentity(profile) {
  const subject = profile?.id != null ? String(profile.id) : '';
  const email = typeof profile?.email === 'string' ? profile.email.trim().toLowerCase() : null;
  const emailVerified = profile?.email_verified === true;
  const name = typeof profile?.name === 'string' ? profile.name.trim() : null;
  const avatar = typeof profile?.avatar_url === 'string' ? profile.avatar_url : null;
  const username = typeof profile?.login === 'string' ? profile.login : null;

  return normalizeExternalIdentity({
    provider: 'github',
    subject,
    email,
    emailVerified,
    name,
    avatar,
    username,
    raw: profile,
  });
}
