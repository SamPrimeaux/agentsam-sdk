import { createIdentityProvider } from '../../provider-contract.js';
import { exchangeCloudflareCode, getCloudflareAuthUrl } from './oauth.js';
import { fetchCloudflareProfile } from './profile.js';
import { normalizeCloudflareIdentity } from './mapper.js';

export const CloudflareProvider = createIdentityProvider({
  id: 'cloudflare',
  authorizeUrl: getCloudflareAuthUrl,
  exchangeCode: exchangeCloudflareCode,
  getProfile: fetchCloudflareProfile,
  normalizeIdentity: normalizeCloudflareIdentity,
});

export {
  getCloudflareAuthUrl,
  exchangeCloudflareCode,
  fetchCloudflareProfile,
  normalizeCloudflareIdentity,
};
