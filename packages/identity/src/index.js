/**
 * @inneranimalmedia/agentsam-sdk/identity — Package #1
 *
 * Contracts, clients, adapters, scaffolding. Sensitive work stays in Identity Service.
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

export * from './core/index.js';
export * from './core/constants.js';

/**
 * @typedef {Object} IdentityClientConfig
 * @property {import('./provider-contract.js').IdentityProvider[]} [providers]
 * @property {{ adapter?: string, binding?: string, baseUrl?: string }} [storage]
 * @property {{ cookie?: string }} [session]
 * @property {{ brand?: { name?: string, logoUrl?: string } }} [portal]
 */

/**
 * Internal runtime factory.
 * @param {IdentityClientConfig} config
 */
export function createIdentity(config = {}) {
  const providers = Array.isArray(config.providers) ? config.providers : listIdentityProviders();
  const storage = config.storage ?? { adapter: 'service' };
  const session = { cookie: config.session?.cookie ?? 'agentsam_session', ...config.session };
  const portal = config.portal ?? {};

  return Object.freeze({
    version: IdentityContractVersion,
    providers,
    storage,
    session,
    portal,
    getProvider(id) {
      const key = String(id || '').toLowerCase();
      return providers.find((p) => p.id === key) ?? getIdentityProvider(key);
    },
  });
}

/**
 * Customer-facing identity client.
 * SDK ships ergonomics; OAuth secrets + D1 writes stay server-side.
 *
 * @param {IdentityClientConfig} config
 */
export function createIdentityClient(config = {}) {
  const runtime = createIdentity(config);

  const providersApi = Object.freeze({
    google: () => runtime.getProvider('google'),
    github: () => runtime.getProvider('github'),
    gcp: () => runtime.getProvider('gcp'),
    email: () => runtime.getProvider('email'),
    get(id) {
      return runtime.getProvider(id);
    },
  });

  return Object.freeze({
    version: runtime.version,
    providers: providersApi,
    portal: runtime.portal,
    /** @param {Request} _request */
    async login(_request) {
      throw new Error('identity_login_requires_identity_service');
    },
    /** @param {Request} _request */
    async signup(_request) {
      throw new Error('identity_signup_requires_identity_service');
    },
    session: Object.freeze({
      /** @param {Request} _request */
      async fromRequest(_request) {
        throw new Error('identity_session_requires_identity_service');
      },
    }),
    user: Object.freeze({
      current: null,
    }),
    _runtime: runtime,
  });
}
