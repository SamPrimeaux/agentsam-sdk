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
import { DEFAULT_IAM_OAUTH_ISSUER } from '../../oauth/credentials.js';

/**
 * @param {string} [issuer]
 */
export function createIamIdentityProvider(issuer = DEFAULT_IAM_OAUTH_ISSUER) {
  const resolvedIssuer = String(issuer || DEFAULT_IAM_OAUTH_ISSUER).replace(/\/+$/, '');
  return createIdentityProvider({
    id: 'iam',
    authorizeUrl: (input) => getIamAuthUrl({ ...input, issuer: resolvedIssuer }),
    exchangeCode: (input) => exchangeIamCode({ ...input, issuer: resolvedIssuer }),
    getProfile: (accessToken) => fetchIamProfile({ issuer: resolvedIssuer, accessToken }),
    normalizeIdentity: normalizeIamIdentity,
  });
}

export const IamProvider = createIamIdentityProvider();

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
