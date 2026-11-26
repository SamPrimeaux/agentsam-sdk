import { createIdentityProvider } from '../../provider-contract.js';
import { exchangeGithubCode, getGithubAuthUrl } from './oauth.js';
import { fetchGithubProfile } from './profile.js';
import { normalizeGithubIdentity } from './mapper.js';

export const GithubProvider = createIdentityProvider({
  id: 'github',
  authorizeUrl: getGithubAuthUrl,
  exchangeCode: exchangeGithubCode,
  getProfile: fetchGithubProfile,
  normalizeIdentity: normalizeGithubIdentity,
});

export { getGithubAuthUrl, exchangeGithubCode, fetchGithubProfile, normalizeGithubIdentity };
