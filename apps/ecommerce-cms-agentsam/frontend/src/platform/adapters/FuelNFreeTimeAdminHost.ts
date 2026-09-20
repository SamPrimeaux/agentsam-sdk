/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Module: Fuel & Free Time Production Host Adapter
 *
 * Production host adapter connecting to Fuel & Free Time's existing Cloudflare Worker:
 * - D1 SQLite databases (completeful_*, orders, products)
 * - R2 media bucket via /api/admin/media
 * - Cloudflare Secrets Store / Worker secret bindings
 * - Resend email dispatch
 * - Stripe checkout & payment intents
 * - Completeful API proxy with shop-scoped bearer credentials
 * - AgentSam MCP gateway
 */

import { AdminHostConfig, HostBrandConfig, HostUser } from '../contracts/AdminHostConfig';
import { SecretStoreAdapter, SecretDescriptor, SecretMetadataInput } from '../contracts/SecretStore';
import { DEFAULT_PROVIDER_DEFINITIONS } from '../contracts/DefaultProviders';
import { CANONICAL_MODEL_CATALOG } from '../contracts/ModelCatalog';

export const FNF_PRODUCTION_BRAND: HostBrandConfig = {
  appName: 'Fuel & Free Time',
  shortName: 'F&FT',
  tagline: 'Motorsport & Outdoor Merch Engine',
  logoUrl: 'https://fuelnfreetime.com/media/archive/shopify-import/logos/fandft-clear-background.png',
  accentColor: '#f59e0b',
  secondaryAccentColor: '#ea580c',
  installationName: 'Fuel & Free Time',
  environment: 'production'
};

/**
 * Cloudflare Secrets Store Vault Adapter
 * Communicates strictly with /api/admin/vault endpoints.
 * Raw secret values are write-only and NEVER returned to the browser.
 */
class CloudflareSecretStoreAdapter implements SecretStoreAdapter {
  private apiBase: string;

  constructor(apiBase: string) {
    this.apiBase = apiBase;
  }

  async putSecret(input: SecretMetadataInput): Promise<SecretDescriptor> {
    const res = await fetch(`${this.apiBase}/vault/secrets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (!res.ok) throw new Error(`Vault put failed: ${res.statusText}`);
    return res.json();
  }

  async rotateSecret(input: SecretMetadataInput): Promise<SecretDescriptor> {
    const res = await fetch(`${this.apiBase}/vault/secrets/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (!res.ok) throw new Error(`Vault rotate failed: ${res.statusText}`);
    return res.json();
  }

  async deleteSecret(params: { provider: string; credential_key: string; environment: string }): Promise<void> {
    const res = await fetch(`${this.apiBase}/vault/secrets/${params.provider}/${params.credential_key}?env=${params.environment}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(`Vault delete failed: ${res.statusText}`);
  }

  async describeSecret(params: { provider: string; credential_key: string; environment: string }): Promise<SecretDescriptor | null> {
    const res = await fetch(`${this.apiBase}/vault/secrets/${params.provider}/${params.credential_key}?env=${params.environment}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Vault describe failed: ${res.statusText}`);
    return res.json();
  }

  async exists(params: { provider: string; credential_key: string; environment: string }): Promise<boolean> {
    const desc = await this.describeSecret(params);
    return desc !== null;
  }

  async verifySecret(params: { provider: string; credential_key: string; environment: string }) {
    const res = await fetch(`${this.apiBase}/vault/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) throw new Error(`Verification failed: ${res.statusText}`);
    return res.json();
  }
}

export function createFuelNFreeTimeAdminHost(options: {
  apiBaseUrl?: string;
  currentUser?: HostUser;
  onNavigate?: (path: string) => void;
}): AdminHostConfig {
  const apiBase = options.apiBaseUrl || '/api/admin';
  const vault = new CloudflareSecretStoreAdapter(apiBase);

  return {
    brand: FNF_PRODUCTION_BRAND,

    routing: {
      basePath: '/admin',
      currentLocation: {
        pathname: window.location.pathname,
        search: window.location.search,
        params: {},
        query: {}
      },
      navigate: (path: string, query?: Record<string, string | undefined>) => {
        const qs = query
          ? '?' +
            Object.entries(query)
              .filter(([_, v]) => v !== undefined)
              .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
              .join('&')
          : '';
        options.onNavigate(path + qs);
      }
    },

    auth: {
      currentUser: () => options.currentUser,
      logout: async () => {
        window.location.href = '/admin/auth/logout';
      },
      hasPermission: (perm) => options.currentUser.permissions.includes('*') || options.currentUser.permissions.includes(perm)
    },

    api: {
      baseUrl: apiBase,
      request: async (endpoint: string, init?: RequestInit) => {
        const res = await fetch(`${apiBase}${endpoint}`, init);
        if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
        return res.json();
      }
    },

    vault,

    providers: {
      listDefinitions: () => DEFAULT_PROVIDER_DEFINITIONS,
      listConnections: async () => {
        const res = await fetch(`${apiBase}/integrations`);
        return res.json();
      },
      getConnection: async (providerKey: string) => {
        const res = await fetch(`${apiBase}/integrations/${providerKey}`);
        return res.json();
      },
      saveConnectionConfig: async (providerKey: string, config: Record<string, any>) => {
        await fetch(`${apiBase}/integrations/${providerKey}/config`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });
      },
      verifyConnection: async (providerKey: string) => {
        const res = await fetch(`${apiBase}/integrations/${providerKey}/verify`, { method: 'POST' });
        return res.json();
      },
      listActivity: async () => {
        const res = await fetch(`${apiBase}/integrations/activity`);
        return res.json();
      }
    },

    media: {
      list: async (folder) => {
        const res = await fetch(`${apiBase}/media${folder ? `?folder=${folder}` : ''}`);
        return res.json();
      },
      upload: async (file, filename, folder = 'images', tags = []) => {
        const fd = new FormData();
        fd.append('file', file, filename);
        fd.append('folder', folder);
        fd.append('tags', JSON.stringify(tags));
        const res = await fetch(`${apiBase}/media/upload`, { method: 'POST', body: fd });
        return res.json();
      },
      remove: async (id) => {
        await fetch(`${apiBase}/media/${id}`, { method: 'DELETE' });
      },
      resolveUrl: (path) => (path.startsWith('http') ? path : `${apiBase}/media/file/${path}`)
    },

    ai: {
      generateImage: async (params) => {
        const res = await fetch(`${apiBase}/ai/generate-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
        return res.json();
      },
      editImage: async (params) => {
        const res = await fetch(`${apiBase}/ai/edit-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
        return res.json();
      },
      generateVideo: async (params) => {
        const res = await fetch(`${apiBase}/ai/generate-video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
        return res.json();
      },
      generateCopy: async (params) => {
        const res = await fetch(`${apiBase}/ai/generate-copy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
        const data = await res.json();
        return data.copy;
      },
      getJob: async (jobId) => {
        const res = await fetch(`${apiBase}/ai/jobs/${jobId}`);
        return res.json();
      }
    },

    cms: {
      listPages: async () => {
        const res = await fetch(`${apiBase}/cms/pages`);
        return res.json();
      },
      getPage: async (slug) => {
        const res = await fetch(`${apiBase}/cms/pages/${slug}`);
        return res.json();
      },
      savePage: async (page) => {
        const res = await fetch(`${apiBase}/cms/pages/${page.slug}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(page)
        });
        return res.json();
      },
      publishPage: async (slug) => {
        await fetch(`${apiBase}/cms/pages/${slug}/publish`, { method: 'POST' });
      }
    },

    mail: {
      getMailboxes: () => ['orders', 'support', 'payments', 'general'],
      getMessages: async (mailbox, folder = 'inbox') => {
        const res = await fetch(`${apiBase}/email/messages?mailbox=${mailbox}&folder=${folder}`);
        return res.json();
      },
      getMessage: async (id) => {
        const res = await fetch(`${apiBase}/email/messages/${id}`);
        return res.json();
      },
      sendMessage: async (msg) => {
        await fetch(`${apiBase}/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg)
        });
      }
    },

    agentsam: {
      listModels: async () => CANONICAL_MODEL_CATALOG,
      getConversations: async () => {
        const res = await fetch(`${apiBase}/agentsam/conversations`);
        return res.json();
      },
      createConversation: async (title) => {
        const res = await fetch(`${apiBase}/agentsam/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title })
        });
        return res.json();
      },
      sendMessage: async (conversationId, content, modelKey) => {
        const res = await fetch(`${apiBase}/agentsam/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, modelKey })
        });
        const data = await res.json();
        return data.reply;
      },
      getMcpStatus: async () => {
        const res = await fetch(`${apiBase}/agentsam/mcp/health`);
        return res.json();
      }
    }
  };
}

export { createFuelNFreeTimeAdminHost as FuelNFreeTimeAdminHost };

