import { IdentityProviders } from '../contracts/provider.js';
import { GoogleProvider } from './google/index.js';
import { GithubProvider } from './github/index.js';
import { GcpProvider } from './gcp/index.js';
import { EmailProvider } from './email/index.js';
import { IamProvider } from './iam/index.js';
import { CloudflareProvider } from './cloudflare/index.js';

/**
 * Active identity provider registry.
 * `inneranimalmedia` is the canonical platform template id; `iam` remains a
 * legacy lookup alias (OAuth/DB provider key on platform identities).
 * @type {Record<string, import('../provider-contract.js').IdentityProvider>}
 */
export const identityProviders = Object.freeze({
  google: GoogleProvider,
  github: GithubProvider,
  gcp: GcpProvider,
  email: EmailProvider,
  inneranimalmedia: IamProvider,
  iam: IamProvider,
  cloudflare: CloudflareProvider,
});

/** @param {string} id */
export function getIdentityProvider(id) {
  const key = String(id || '').trim().toLowerCase();
  if (key === 'iam') return identityProviders.inneranimalmedia || identityProviders.iam || null;
  return identityProviders[key] || null;
}

export function listIdentityProviders() {
  return IdentityProviders.map((id) => identityProviders[id]).filter(Boolean);
}

export {
  GoogleProvider,
  GithubProvider,
  GcpProvider,
  EmailProvider,
  IamProvider,
  CloudflareProvider,
};
