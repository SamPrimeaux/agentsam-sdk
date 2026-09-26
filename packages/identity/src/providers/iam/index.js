import { createIdentityProvider } from '../../provider-contract.js';
import {
  exchangeIamCode,
  getIamAuthUrl,
  IAM_DEFAULT_OIDC_SCOPE,
  IAM_IDENTITY_AUTHORIZE_PATH,
  IAM_IDENTITY_TOKEN_PATH,
  IAM_IDENTITY_USERINFO_PATH,
} from './oauth.js';
import { fetchIamProfile } from './profile.js';
import { normalizeIamIdentity } from './mapper.js';
import { resolveIamIssuer } from '../../contracts/auth-config.js';

/**
 * @param {string} origin Absolute IAM issuer origin (required — no DEFAULT_*).
 */
export function createIamIdentityProvider(origin) {
  const resolvedOrigin = String(origin || '').replace(/\/+$/, '');
  if (!resolvedOrigin) {
    throw new Error('IAM_OAUTH_ISSUER is required to create the IAM identity provider');
  }
  return createIdentityProvider({
    id: 'iam',
    authorizeUrl: (input) => getIamAuthUrl({ ...input, origin: resolvedOrigin }),
    exchangeCode: (input) => exchangeIamCode({ ...input, origin: resolvedOrigin }),
    getProfile: (accessToken) => fetchIamProfile({ origin: resolvedOrigin, accessToken }),
    normalizeIdentity: normalizeIamIdentity,
  });
}

/**
 * Registry singleton — resolves IAM_OAUTH_ISSUER from env/input at call time.
 * No baked-in product host.
 */
export const IamProvider = createIdentityProvider({
  id: 'iam',
  authorizeUrl: (input) => {
    const origin = resolveIamIssuer(input?.env || process.env, input?.origin || input?.issuer || '');
    return getIamAuthUrl({ ...input, origin });
  },
  exchangeCode: (input) => {
    const origin = resolveIamIssuer(input?.env || process.env, input?.origin || input?.issuer || '');
    return exchangeIamCode({ ...input, origin });
  },
  getProfile: (accessToken, input = {}) => {
    const origin = resolveIamIssuer(input?.env || process.env, input?.origin || input?.issuer || '');
    return fetchIamProfile({ origin, accessToken });
  },
  normalizeIdentity: normalizeIamIdentity,
});

export {
  getIamAuthUrl,
  exchangeIamCode,
  fetchIamProfile,
  normalizeIamIdentity,
  IAM_DEFAULT_OIDC_SCOPE,
  IAM_IDENTITY_AUTHORIZE_PATH,
  IAM_IDENTITY_TOKEN_PATH,
  IAM_IDENTITY_USERINFO_PATH,
};
