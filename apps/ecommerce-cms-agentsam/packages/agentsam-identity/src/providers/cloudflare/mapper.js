import { normalizeExternalIdentity } from '../../contracts/external-identity.js';

/**
 * @param {Record<string, unknown>|null|undefined} profile
 */
export function normalizeCloudflareIdentity(profile) {
  const raw = profile && typeof profile === 'object' ? profile : {};
  const subject = String(raw.sub || raw.id || raw.user_id || raw.account_id || '').trim();
  if (!subject) {
    throw new Error('cloudflare_identity_requires_subject');
  }
  return normalizeExternalIdentity({
    provider: 'cloudflare',
    subject,
    email: typeof raw.email === 'string' ? raw.email : null,
    emailVerified: Boolean(raw.email),
    name: typeof raw.name === 'string' ? raw.name : (typeof raw.display_name === 'string' ? raw.display_name : null),
    avatar: null,
    raw,
  });
}
