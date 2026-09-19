/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Module: Mock Admin Host Adapter
 *
 * Standalone mock host used for local development, AI Studio previews, and integration testing.
 * Provides realistic mock responses while adhering strictly to the AdminHostConfig contract.
 */

import { AdminHostConfig, HostBrandConfig, HostUser, MediaItem, AiGenerationJob, CmsPage, MailMessage, AgentSamConversation } from '../contracts/AdminHostConfig';
import { SecretStoreAdapter, SecretDescriptor, SecretMetadataInput, SecretStore } from '../contracts/SecretStore';
import { LocalSecretStoreAdapter } from './LocalSecretStoreAdapter';
import { ProviderConnection, IntegrationActivity } from '../contracts/ProviderRegistry';
import { DEFAULT_PROVIDER_DEFINITIONS } from '../contracts/DefaultProviders';
import { CANONICAL_MODEL_CATALOG } from '../contracts/ModelCatalog';
import { INITIAL_ASSETS } from '../../../data/initialAssets';

// Default Brand Config for the Fuel & Free Time Installation
export const FNF_BRAND_CONFIG: HostBrandConfig = {
  appName: 'Fuel & Free Time',
  shortName: 'F&FT',
  tagline: 'Motorsport & Outdoor Merch Engine',
  logoUrl: 'https://fuelnfreetime.com/media/archive/shopify-import/logos/fandft-clear-background.png',
  accentColor: '#f59e0b',
  secondaryAccentColor: '#ea580c',
  installationName: 'Fuel & Free Time Commerce OS',
  environment: 'preview'
};

export const MOCK_CURRENT_USER: HostUser = {
  id: 'usr_admin_fnf_01',
  name: 'Sam / F&FT Team',
  email: 'info@inneranimals.com',
  avatarUrl: 'https://fuelnfreetime.com/media/archive/shopify-import/logos/fandft-clear-background.png',
  role: 'owner',
  permissions: ['*']
};

/**
 * In-Memory Secret Store implementing write-only storage
 */
class InMemorySecretStore implements SecretStoreAdapter {
  private secrets: Map<string, SecretDescriptor> = new Map();

  constructor() {
    // Seed initial descriptors with masked last4
    this.seed('completeful', 'CAPP_KEY', '7ac2', 'capp_test_');
    this.seed('completeful', 'COMPLETEFUL_WEBHOOK_SECRET', '99a1', 'whsec_');
    this.seed('stripe', 'STRIPE_SECRET_KEY', '51f4', 'sk_test_');
    this.seed('stripe', 'STRIPE_WEBHOOK_SECRET', '2b80', 'whsec_');
    this.seed('resend', 'RESEND_API_KEY', '3c19', 're_');
    this.seed('openai', 'OPENAI_API_KEY', '881f', 'sk-proj-');
    this.seed('inneranimalmedia', 'AGENTSAM_BRIDGE_KEY', '4d90', 'iam_');
  }

  private seed(provider: string, key: string, last4: string, prefix = '') {
    const compositeKey = `${provider}:${key}:preview`;
    this.secrets.set(compositeKey, {
      id: `sec_${Math.random().toString(36).substring(7)}`,
      account_id: 'fnf_account_01',
      provider,
      environment: 'preview',
      credential_key: key,
      storage_backend: 'cloudflare_secrets_store',
      secret_ref: `vault://cf-secrets/fnf/${provider}/${key.toLowerCase()}`,
      last4,
      status: 'healthy',
      scopes: ['read', 'write'],
      created_at: Date.now() - 86400000 * 7,
      updated_at: Date.now() - 86400000,
      last_verified_at: Date.now() - 3600000,
      created_by: 'Sam',
      updated_by: 'Sam'
    });
  }

  async putSecret(input: SecretMetadataInput): Promise<SecretDescriptor> {
    const compositeKey = `${input.provider}:${input.credential_key}:${input.environment}`;
    const cleanVal = input.secret_value.trim();
    const last4 = cleanVal.length >= 4 ? cleanVal.slice(-4) : 'xxxx';
    const descriptor: SecretDescriptor = {
      id: `sec_${Math.random().toString(36).substring(7)}`,
      account_id: input.account_id,
      provider: input.provider,
      environment: input.environment,
      credential_key: input.credential_key,
      storage_backend: 'cloudflare_secrets_store',
      secret_ref: `vault://cf-secrets/fnf/${input.provider}/${input.credential_key.toLowerCase()}`,
      last4,
      status: 'healthy',
      scopes: input.scopes || ['read', 'write'],
      created_at: Date.now(),
      updated_at: Date.now(),
      last_verified_at: Date.now(),
      created_by: 'admin_user',
      updated_by: 'admin_user'
    };
    this.secrets.set(compositeKey, descriptor);
    return descriptor;
  }

  async rotateSecret(input: SecretMetadataInput): Promise<SecretDescriptor> {
    return this.putSecret(input);
  }

  async deleteSecret(params: { provider: string; credential_key: string; environment: string }): Promise<void> {
    const compositeKey = `${params.provider}:${params.credential_key}:${params.environment}`;
    this.secrets.delete(compositeKey);
  }

  async describeSecret(params: { provider: string; credential_key: string; environment: string }): Promise<SecretDescriptor | null> {
    const compositeKey = `${params.provider}:${params.credential_key}:${params.environment}`;
    return this.secrets.get(compositeKey) || null;
  }

  async exists(params: { provider: string; credential_key: string; environment: string }): Promise<boolean> {
    const compositeKey = `${params.provider}:${params.credential_key}:${params.environment}`;
    return this.secrets.has(compositeKey);
  }

  async verifySecret(params: { provider: string; credential_key: string; environment: string }) {
    await new Promise((r) => setTimeout(r, 600));
    return {
      valid: true,
      status: 'healthy' as const,
      message: `Verified handshake with ${params.provider} (${params.credential_key})`,
      testedAt: Date.now()
    };
  }
}

export function createMockAdminHost(options?: {
  initialPath?: string;
  onNavigate?: (path: string) => void;
}): AdminHostConfig {
  const secretStore = new LocalSecretStoreAdapter([
    { provider: 'completeful', key: 'CAPP_KEY', environment: 'preview', dummySecret: 'capp_test_7ac2' },
    { provider: 'completeful', key: 'COMPLETEFUL_WEBHOOK_SECRET', environment: 'preview', dummySecret: 'whsec_99a1' },
    { provider: 'stripe', key: 'STRIPE_SECRET_KEY', environment: 'preview', dummySecret: 'sk_test_51f4' },
    { provider: 'stripe', key: 'STRIPE_WEBHOOK_SECRET', environment: 'preview', dummySecret: 'whsec_2b80' },
    { provider: 'resend', key: 'RESEND_API_KEY', environment: 'preview', dummySecret: 're_3c19' },
    { provider: 'openai', key: 'OPENAI_API_KEY', environment: 'preview', dummySecret: 'sk-proj-881f' },
    { provider: 'inneranimalmedia', key: 'AGENTSAM_BRIDGE_KEY', environment: 'preview', dummySecret: 'iam_4d90' }
  ]);

  let mediaItems: MediaItem[] = [
    {
      id: 'med_01',
      filename: 'fandft-clear-background.png',
      url: 'https://fuelnfreetime.com/media/archive/shopify-import/logos/fandft-clear-background.png',
      mimeType: 'image/png',
      sizeBytes: 142800,
      folder: 'artwork',
      tags: ['logo', 'transparent', 'official'],
      createdAt: Date.now() - 86400000 * 12
    },
    {
      id: 'med_02',
      filename: 'heavyweight-hoodie-black-blank.png',
      url: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=800&q=80',
      mimeType: 'image/png',
      sizeBytes: 489200,
      folder: 'products',
      tags: ['hoodie', 'apparel', 'blank'],
      createdAt: Date.now() - 86400000 * 8
    },
    {
      id: 'med_03',
      filename: 'vintage-dirtbike-action-banner.jpg',
      url: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=1200&q=80',
      mimeType: 'image/jpeg',
      sizeBytes: 940000,
      folder: 'banners',
      tags: ['action', 'motorsport', 'campaign'],
      createdAt: Date.now() - 86400000 * 4
    }
  ];

  let cmsPages: CmsPage[] = [
    {
      id: 'page_home',
      slug: 'home',
      title: 'Storefront Homepage',
      status: 'published',
      author: 'Sam',
      updatedAt: Date.now() - 3600000 * 4,
      template: 'landing-v2',
      summary: 'Main storefront heroic layout, featured drops, and newsletter.'
    },
    {
      id: 'page_apparel',
      slug: 'apparel',
      title: 'Apparel & Riding Gear Collection',
      status: 'published',
      author: 'Sam',
      updatedAt: Date.now() - 86400000 * 2,
      template: 'catalog-grid',
      summary: 'Curated Completeful DTG hoodies, vintage tees, and riding gear.'
    },
    {
      id: 'page_about',
      slug: 'about-us',
      title: 'About Fuel & Free Time',
      status: 'published',
      author: 'Sam',
      updatedAt: Date.now() - 86400000 * 15,
      template: 'story',
      summary: 'Motorsport heritage, trackside garage culture, and creative free time.'
    }
  ];

  let mailMessages: MailMessage[] = [
    {
      id: 'msg_01',
      mailbox: 'orders',
      folder: 'inbox',
      from: 'Completeful Webhook <dispatch@completeful.com>',
      to: ['orders@fuelnfreetime.com'],
      subject: 'Fulfillment Tracking Assigned for Order #FFT-9402',
      snippet: 'USPS Priority 9400111899223400192 assigned to DTG Hoodie production.',
      bodyText: 'Tracking #9400111899223400192 has been generated by Completeful fulfillment center in Charlotte, NC. Customer notified automatically.',
      isRead: false,
      isStarred: true,
      receivedAt: Date.now() - 1000 * 60 * 25,
      threadId: 'th_01'
    },
    {
      id: 'msg_02',
      mailbox: 'support',
      folder: 'inbox',
      from: 'Travis Miller <travis@gmail.com>',
      to: ['info@fuelnfreetime.com'],
      subject: 'Inquiry on XXL Sizing for Washed Charcoal Hoodie',
      snippet: 'Hey guys, does the washed heavyweight hoodie run true to size or oversized?',
      bodyText: 'Hey guys, loving the motorcycle drop. Does the washed heavyweight hoodie run true to size or oversized? Want to make sure it fits over a riding chest protector.',
      isRead: true,
      isStarred: false,
      receivedAt: Date.now() - 1000 * 60 * 180,
      threadId: 'th_02'
    },
    {
      id: 'msg_03',
      mailbox: 'payments',
      folder: 'inbox',
      from: 'Stripe Notifications <notifications@stripe.com>',
      to: ['payments@fuelnfreetime.com'],
      subject: 'Daily Payout Scheduled: $1,420.50 USD',
      snippet: 'Payout of $1,420.50 initiated to business checking ending in •••• 4019.',
      bodyText: 'Payout of $1,420.50 initiated to business checking ending in •••• 4019. Expected arrival in 1-2 business days.',
      isRead: true,
      isStarred: false,
      receivedAt: Date.now() - 1000 * 60 * 60 * 8,
      threadId: 'th_03'
    }
  ];

  let agentConversations: AgentSamConversation[] = [
    {
      id: 'conv_default',
      title: 'Completeful Catalog Curation & Fall Drop',
      updatedAt: Date.now() - 1000 * 60 * 15,
      modelKey: 'gemini-2.5-flash',
      messages: [
        {
          id: 'msg_c1',
          role: 'user',
          content: 'Audit our Completeful variant links for the black heavyweight hoodie. Are our retail margins healthy?',
          timestamp: Date.now() - 1000 * 60 * 20
        },
        {
          id: 'msg_c2',
          role: 'assistant',
          content: 'I analyzed your Completeful DTG variant mappings. Completeful quotes unit fulfillment at **$28.50** (including front chest DTG print). With your retail price at **$68.00**, you maintain a **$39.50 gross profit margin (58.1%)** per hoodie. That provides healthy headroom for payment processing and shipping buffers.',
          timestamp: Date.now() - 1000 * 60 * 19
        }
      ]
    }
  ];

  let activities: IntegrationActivity[] = [
    {
      id: 'act_101',
      provider: 'completeful',
      operation: 'quote_calculate',
      resourceType: 'order_quote',
      resourceId: 'capp_q_8831',
      status: 'success',
      environment: 'preview',
      durationMs: 142,
      actor: 'Commerce Worker',
      timestamp: Date.now() - 1000 * 60 * 12,
      safeMetadata: { itemsCount: 2, quotedCost: 38.5, currency: 'USD' }
    },
    {
      id: 'act_102',
      provider: 'stripe',
      operation: 'payment_intent.succeeded',
      resourceType: 'payment_intent',
      resourceId: 'pi_3PqL920kL',
      status: 'success',
      environment: 'preview',
      durationMs: 89,
      actor: 'Stripe Webhook',
      timestamp: Date.now() - 1000 * 60 * 25,
      safeMetadata: { amount: 136.0, currency: 'usd', customer: 'cus_R89102' }
    },
    {
      id: 'act_103',
      provider: 'completeful',
      operation: 'order_create',
      resourceType: 'fulfillment_order',
      resourceId: 'capp_ord_9901',
      status: 'success',
      environment: 'preview',
      durationMs: 310,
      actor: 'Completeful Adapter',
      timestamp: Date.now() - 1000 * 60 * 45,
      safeMetadata: { shopId: 'shop_fft_0192a8', mode: 'test', dryRun: true }
    },
    {
      id: 'act_104',
      provider: 'resend',
      operation: 'email.send',
      resourceType: 'transactional_mail',
      resourceId: 're_msg_77019',
      status: 'success',
      environment: 'preview',
      durationMs: 180,
      actor: 'Order Dispatcher',
      timestamp: Date.now() - 1000 * 60 * 50,
      safeMetadata: { template: 'order_confirmation', to: 'customer@gmail.com' }
    }
  ];

  return {
    brand: FNF_BRAND_CONFIG,

    routing: {
      basePath: '/admin',
      currentLocation: {
        pathname: '/admin/home',
        search: '',
        params: {},
        query: {}
      },
      navigate: (path: string, query?: Record<string, string | undefined>) => {
        if (options?.onNavigate) {
          const queryString = query
            ? Object.entries(query)
                .filter(([_, v]) => v !== undefined)
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
                .join('&')
            : '';
          options.onNavigate(queryString ? `${path}?${queryString}` : path);
        }
      }
    },

    auth: {
      currentUser: () => MOCK_CURRENT_USER,
      logout: async () => {
        alert('Mock session logout triggered');
      },
      hasPermission: () => true
    },

    api: {
      baseUrl: '/api/admin',
      request: async <T = any>(endpoint: string, options?: RequestInit): Promise<T> => {
        return { success: true, endpoint } as unknown as T;
      }
    },

    vault: secretStore,

    providers: {
      listDefinitions: () => DEFAULT_PROVIDER_DEFINITIONS,
      listConnections: async () => {
        return DEFAULT_PROVIDER_DEFINITIONS.map((def) => ({
          id: `conn_${def.id}`,
          providerKey: def.id,
          environment: 'preview',
          status: def.id === 'github' ? 'not_configured' : 'healthy',
          mode: def.id === 'completeful' ? 'test' : 'live',
          config: {
            CAPP_API_URL: 'https://api.completeful.com/v1',
            COMPLETEFUL_ALLOW_LIVE_WRITES: false,
            PRIMARY_SHOP_ID: 'shop_fft_0192a8'
          },
          credentials: {},
          lastVerifiedAt: Date.now() - 1000 * 60 * 15,
          createdAt: Date.now() - 86400000 * 14,
          updatedAt: Date.now() - 86400000
        }));
      },
      getConnection: async (providerKey: string) => {
        return {
          id: `conn_${providerKey}`,
          providerKey,
          environment: 'preview',
          status: 'healthy',
          mode: 'test',
          config: {
            CAPP_API_URL: 'https://api.completeful.com/v1',
            COMPLETEFUL_ALLOW_LIVE_WRITES: false,
            PRIMARY_SHOP_ID: 'shop_fft_0192a8'
          },
          credentials: {},
          lastVerifiedAt: Date.now() - 1000 * 60 * 15,
          createdAt: Date.now() - 86400000 * 14,
          updatedAt: Date.now() - 86400000
        };
      },
      saveConnectionConfig: async (providerKey: string, config: Record<string, any>) => {
        console.log(`[Host] Saved connection config for ${providerKey}`, config);
      },
      verifyConnection: async (providerKey: string) => {
        await new Promise((r) => setTimeout(r, 600));
        return {
          status: 'healthy',
          message: `Provider ${providerKey} verified successfully in preview environment.`
        };
      },
      listActivity: async () => activities
    },

    media: {
      list: async (folder?: string) => {
        if (!folder) return mediaItems;
        return mediaItems.filter((m) => m.folder === folder);
      },
      upload: async (file: File | Blob, filename: string, folder = 'images', tags: string[] = []) => {
        const newItem: MediaItem = {
          id: `med_${Date.now()}`,
          filename,
          url: URL.createObjectURL(file),
          mimeType: file.type || 'image/png',
          sizeBytes: file.size || 204800,
          folder: folder as any,
          tags: tags.length ? tags : ['upload'],
          createdAt: Date.now()
        };
        mediaItems = [newItem, ...mediaItems];
        return newItem;
      },
      remove: async (id: string) => {
        mediaItems = mediaItems.filter((m) => m.id !== id);
      },
      resolveUrl: (pathOrKey: string) => pathOrKey
    },

    ai: {
      generateImage: async (params) => {
        const jobId = `job_img_${Date.now()}`;
        return {
          id: jobId,
          type: 'image',
          status: 'succeeded',
          prompt: params.prompt,
          modelKey: params.modelKey || 'gemini-2.5-flash',
          progressPercent: 100,
          createdAt: Date.now(),
          completedAt: Date.now(),
          resultUrl: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=800&q=80',
          parameters: params
        };
      },
      editImage: async (params) => {
        const jobId = `job_edit_${Date.now()}`;
        return {
          id: jobId,
          type: 'image',
          status: 'succeeded',
          prompt: params.prompt,
          modelKey: params.modelKey || 'gemini-2.5-flash',
          progressPercent: 100,
          createdAt: Date.now(),
          completedAt: Date.now(),
          resultUrl: params.sourceImageUrl,
          parameters: params
        };
      },
      generateVideo: async (params) => {
        const jobId = `job_vid_${Date.now()}`;
        return {
          id: jobId,
          type: 'video',
          status: 'running',
          prompt: params.prompt,
          modelKey: params.modelKey || 'veo-2.0',
          progressPercent: 35,
          createdAt: Date.now(),
          parameters: params
        };
      },
      generateCopy: async (params) => {
        return `Premium heavyweight cotton fleece hoodie featuring authentic Fuel & Free Time vintage track graphics. Pre-shrunk, reinforced double-needle seams, and premium water-based DTG ink absorption designed to withstand motorcycle track days and garage wear.`;
      },
      getJob: async (jobId: string) => null
    },

    cms: {
      listPages: async () => cmsPages,
      getPage: async (slug: string) => cmsPages.find((p) => p.slug === slug) || null,
      savePage: async (pageData) => {
        const existingIdx = cmsPages.findIndex((p) => p.slug === pageData.slug);
        if (existingIdx >= 0) {
          cmsPages[existingIdx] = { ...cmsPages[existingIdx], ...pageData, updatedAt: Date.now() };
          return cmsPages[existingIdx];
        } else {
          const newPage: CmsPage = {
            id: `page_${Date.now()}`,
            slug: pageData.slug,
            title: pageData.title || 'Untitled Page',
            status: pageData.status || 'draft',
            author: 'Sam',
            updatedAt: Date.now(),
            template: pageData.template || 'default',
            summary: pageData.summary || ''
          };
          cmsPages.push(newPage);
          return newPage;
        }
      },
      publishPage: async (slug: string) => {
        const page = cmsPages.find((p) => p.slug === slug);
        if (page) page.status = 'published';
      }
    },

    mail: {
      getMailboxes: () => ['orders', 'support', 'payments', 'general'],
      getMessages: async (mailbox: string, folder = 'inbox') => {
        return mailMessages.filter((m) => m.mailbox === mailbox && m.folder === folder);
      },
      getMessage: async (id: string) => mailMessages.find((m) => m.id === id) || null,
      sendMessage: async (msg) => {
        mailMessages.push({
          id: `msg_${Date.now()}`,
          mailbox: msg.mailbox,
          folder: 'sent',
          from: `${msg.mailbox}@fuelnfreetime.com`,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.bodyText.substring(0, 80),
          bodyText: msg.bodyText,
          isRead: true,
          isStarred: false,
          receivedAt: Date.now(),
          threadId: `th_${Date.now()}`
        });
      }
    },

    agentsam: {
      listModels: async () => CANONICAL_MODEL_CATALOG,
      getConversations: async () => agentConversations,
      createConversation: async (title = 'New Investigation') => {
        const newConv: AgentSamConversation = {
          id: `conv_${Date.now()}`,
          title,
          updatedAt: Date.now(),
          modelKey: 'gemini-2.5-flash',
          messages: [
            {
              id: `msg_${Date.now()}`,
              role: 'assistant',
              content: 'AgentSam Copilot ready. I can inspect Completeful inventory, optimize DTG placement rules, or query your D1 link registry.',
              timestamp: Date.now()
            }
          ]
        };
        agentConversations = [newConv, ...agentConversations];
        return newConv;
      },
      sendMessage: async (conversationId: string, content: string, modelKey = 'gemini-2.5-flash') => {
        const conv = agentConversations.find((c) => c.id === conversationId);
        if (conv) {
          conv.messages.push({
            id: `msg_${Date.now()}_u`,
            role: 'user',
            content,
            timestamp: Date.now()
          });
          const reply = `[${modelKey}] Analysis complete. I've audited the target parameters against your host contracts and D1 link state. Actions were verified with safe dry-run parameters.`;
          conv.messages.push({
            id: `msg_${Date.now()}_a`,
            role: 'assistant',
            content: reply,
            timestamp: Date.now() + 200
          });
          conv.updatedAt = Date.now();
          return reply;
        }
        return 'Conversation not found';
      },
      getMcpStatus: async () => ({
        status: 'connected',
        latencyMs: 38,
        toolsCount: 26
      })
    }
  };
}

export { createMockAdminHost as MockAdminHost };

