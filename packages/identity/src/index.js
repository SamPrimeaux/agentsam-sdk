/**
 * @agentsam/identity — AgentSam SDK package #1
 *
 * Portable identity: providers, sessions, OAuth — app adapters for storage.
 */
import { IdentityContractVersion, normalizeIdentityUser } from './contracts/identity.js';
import { normalizeIdentitySession } from './contracts/session.js';
import { IdentityProviders } from './contracts/provider.js';
import { normalizeExternalIdentity } from './contracts/external-identity.js';
import {
  createIdentityProvider,
  normalizeExternalIdentity as normalizeProviderIdentity,
} from './provider-contract.js';
import {
  identityProviders,
  getIdentityProvider,
  listIdentityProviders,
  GoogleProvider,
  GithubProvider,
  GcpProvider,
  EmailProvider,
} from './providers/index.js';

export {
  IdentityContractVersion,
  normalizeIdentityUser,
  normalizeIdentitySession,
  IdentityProviders,
  normalizeExternalIdentity,
  createIdentityProvider,
  normalizeProviderIdentity,
  identityProviders,
  getIdentityProvider,
  listIdentityProviders,
  GoogleProvider,
  GithubProvider,
  GcpProvider,
  EmailProvider,
};

/**
 * @typedef {Object} IdentityConfig
 * @property {import('./provider-contract.js').IdentityProvider[]} [providers]
 * @property {{ adapter: string, binding?: string }} [storage]
 * @property {{ cookie?: string }} [session]
 */

/**
 * Create a configured identity runtime (Phase 1 — factory shell; services land Phase 3).
 *
 * @param {IdentityConfig} config
 */
export function createIdentity(config = {}) {
  const providers = Array.isArray(config.providers) ? config.providers : listIdentityProviders();
  const storage = config.storage ?? { adapter: 'memory' };
  const session = { cookie: config.session?.cookie ?? 'agentsam_session', ...config.session };

  return Object.freeze({
    version: IdentityContractVersion,
    providers,
    storage,
    session,
    getProvider(id) {
      const fromConfig = providers.find((p) => p.id === String(id || '').toLowerCase());
      return fromConfig ?? getIdentityProvider(id);
    },
    // Phase 3+: oauth, sessions, accounts services attach here
    oauth: null,
    sessions: null,
    accounts: null,
  });
}
