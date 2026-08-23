import { IdentityProviders } from '../contracts/provider.js';
import { GoogleProvider } from './google/index.js';
import { GithubProvider } from './github/index.js';
import { GcpProvider } from './gcp/index.js';
import { EmailProvider } from './email/index.js';
import { IamProvider } from './iam/index.js';

/** @type {Record<string, import('../provider-contract.js').IdentityProvider>} */
export const identityProviders = Object.freeze({
  google: GoogleProvider,
  github: GithubProvider,
  gcp: GcpProvider,
  email: EmailProvider,
  iam: IamProvider,
});

/** @param {string} id */
export function getIdentityProvider(id) {
  const key = String(id || '').trim().toLowerCase();
  return identityProviders[key] || null;
}

export function listIdentityProviders() {
  return IdentityProviders.map((id) => identityProviders[id]).filter(Boolean);
}

export { GoogleProvider, GithubProvider, GcpProvider, EmailProvider, IamProvider };
