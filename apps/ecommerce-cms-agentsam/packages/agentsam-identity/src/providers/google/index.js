import { createIdentityProvider } from '../../provider-contract.js';
import { exchangeGoogleCode, getGoogleAuthUrl } from './oauth.js';
import { fetchGoogleProfile } from './profile.js';
import { normalizeGoogleIdentity } from './mapper.js';

export const GoogleProvider = createIdentityProvider({
  id: 'google',
  authorizeUrl: getGoogleAuthUrl,
  exchangeCode: exchangeGoogleCode,
  getProfile: fetchGoogleProfile,
  normalizeIdentity: normalizeGoogleIdentity,
});

export { getGoogleAuthUrl, exchangeGoogleCode, fetchGoogleProfile, normalizeGoogleIdentity };
