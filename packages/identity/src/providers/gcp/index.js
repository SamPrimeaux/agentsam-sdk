/**
 * GCP workforce / Google Cloud OAuth provider scaffold.
 * Sprint 2: contract + endpoints only — wire to production in a later sprint.
 */
import { createIdentityProvider } from '../../provider-contract.js';
import { normalizeExternalIdentity } from '../../contracts/external-identity.js';

const GCP_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

/** @param {import('../../provider-contract.js').OAuthAuthorizeInput} input */
export function getGcpAuthUrl({ clientId, redirectUri, state, codeChallenge, scope } = {}) {
  const url = new URL(GCP_AUTH_URL);
  url.searchParams.set('client_id', clientId || '');
  url.searchParams.set('redirect_uri', redirectUri || '');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scope || 'openid email profile');
  url.searchParams.set('state', state || '');
  if (codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

/** @param {import('../../provider-contract.js').OAuthExchangeInput} _input */
export async function exchangeGcpCode(_input) {
  throw new Error('gcp_provider_exchange_not_implemented');
}

/** @param {string} _accessToken */
export async function fetchGcpProfile(_accessToken) {
  throw new Error('gcp_provider_profile_not_implemented');
}

/** @param {Record<string, unknown>} profile */
export function normalizeGcpIdentity(profile) {
  const subject = profile?.sub != null ? String(profile.sub) : '';
  const email = typeof profile?.email === 'string' ? profile.email.trim().toLowerCase() : null;
  return normalizeExternalIdentity({
    provider: 'gcp',
    subject,
    email,
    emailVerified: profile?.email_verified === true,
    name: typeof profile?.name === 'string' ? profile.name.trim() : null,
    avatar: typeof profile?.picture === 'string' ? profile.picture : null,
    raw: profile,
  });
}

export const GcpProvider = createIdentityProvider({
  id: 'gcp',
  authorizeUrl: getGcpAuthUrl,
  exchangeCode: exchangeGcpCode,
  getProfile: fetchGcpProfile,
  normalizeIdentity: normalizeGcpIdentity,
});
