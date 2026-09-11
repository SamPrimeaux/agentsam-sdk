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
import { DEFAULT_IAM_ORIGIN } from '../../contracts/auth-config.js';

/**
 * @param {string} [origin]
 */
export function createIamIdentityProvider(origin = DEFAULT_IAM_ORIGIN) {
  const resolvedOrigin = String(origin || DEFAULT_IAM_ORIGIN).replace(/\/+$/, '');
  return createIdentityProvider({
    id: 'iam',
    authorizeUrl: (input) => getIamAuthUrl({ ...input, origin: resolvedOrigin }),
    exchangeCode: (input) => exchangeIamCode({ ...input, origin: resolvedOrigin }),
    getProfile: (accessToken) => fetchIamProfile({ origin: resolvedOrigin, accessToken }),
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
