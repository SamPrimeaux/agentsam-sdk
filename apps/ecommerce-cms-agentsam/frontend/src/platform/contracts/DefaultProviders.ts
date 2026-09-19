/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Module: Default Provider Registry Definitions
 */

import { ProviderDefinition } from './ProviderRegistry';

export const DEFAULT_PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: 'completeful',
    label: 'Completeful Technologies',
    description: 'Print-on-demand fulfillment, DTG/embroidery apparel, authoritative cost quotes, and shop synchronization.',
    category: 'fulfillment',
    iconName: 'Truck',
    websiteUrl: 'https://completeful.com',
    docsUrl: 'https://docs.completeful.com/api',
    supportsTestMode: true,
    capabilities: [
      'Store Product Publishing',
      'Authoritative Order Quotes',
      'Fulfillment Dispatch',
      'Automated Tracking Webhooks',
      'Design Catalog & Blank Sync'
    ],
    credentials: [
      {
        key: 'CAPP_KEY',
        label: 'API Key (Bearer Token)',
        description: 'Shop-scoped authorization token. Use capp_test_ prefix for dry runs, capp_live_ for production.',
        isSecret: true,
        isRequired: true,
        formatPlaceholder: 'capp_test_...',
        testModePrefix: 'capp_test_',
        liveModePrefix: 'capp_live_'
      },
      {
        key: 'COMPLETEFUL_WEBHOOK_SECRET',
        label: 'Webhook Signing Secret',
        description: 'HMAC-SHA256 secret used to verify incoming fulfillment events in X-Capp-Signature.',
        isSecret: true,
        isRequired: true,
        formatPlaceholder: 'whsec_...'
      }
    ],
    variables: [
      {
        key: 'CAPP_API_URL',
        label: 'API Base URL',
        description: 'Target API endpoint. Defaults to production gateway.',
        type: 'string',
        defaultValue: 'https://api.completeful.com/v1',
        isSecret: false,
        isRequired: true
      },
      {
        key: 'COMPLETEFUL_ALLOW_LIVE_WRITES',
        label: 'Live Writes Safety Switch',
        description: 'When disabled, all mutations behave as dry-runs regardless of API key mode.',
        type: 'boolean',
        defaultValue: false,
        isSecret: false
      },
      {
        key: 'PRIMARY_SHOP_ID',
        label: 'Active Completeful Shop ID',
        description: 'Shop identifier linked to this commerce store.',
        type: 'string',
        defaultValue: 'shop_fft_0192a8',
        isSecret: false
      }
    ],
    webhookSupport: [
      {
        topic: 'order.production.started',
        label: 'Production Started',
        description: 'Triggered when garments enter the physical DTG printer queue.',
        signatureHeader: 'X-Capp-Signature',
        algorithm: 'HMAC-SHA256'
      },
      {
        topic: 'order.shipped',
        label: 'Order Shipped',
        description: 'Carrier tracking number and shipping label assigned.',
        signatureHeader: 'X-Capp-Signature',
        algorithm: 'HMAC-SHA256'
      },
      {
        topic: 'order.delivery.exception',
        label: 'Delivery Exception',
        description: 'Carrier address issue or return-to-sender notification.',
        signatureHeader: 'X-Capp-Signature',
        algorithm: 'HMAC-SHA256'
      }
    ]
  },
  {
    id: 'stripe',
    label: 'Stripe Payments',
    description: 'Payment intents, checkout sessions, customer billing, and webhooks.',
    category: 'payments',
    iconName: 'CreditCard',
    websiteUrl: 'https://stripe.com',
    docsUrl: 'https://stripe.com/docs/api',
    supportsTestMode: true,
    capabilities: ['Card Payments', 'Apple Pay / Google Pay', 'Refunds', 'Payment Webhooks'],
    credentials: [
      {
        key: 'STRIPE_SECRET_KEY',
        label: 'Secret Key',
        description: 'Stripe API key (sk_test_... or sk_live_...). Stored write-only in host vault.',
        isSecret: true,
        isRequired: true,
        testModePrefix: 'sk_test_',
        liveModePrefix: 'sk_live_'
      },
      {
        key: 'STRIPE_WEBHOOK_SECRET',
        label: 'Endpoint Secret',
        description: 'Signing secret for Stripe webhook validation (whsec_...).',
        isSecret: true,
        isRequired: true
      }
    ],
    variables: [
      {
        key: 'CURRENCY',
        label: 'Default Currency',
        description: 'Store checkout currency.',
        type: 'select',
        defaultValue: 'usd',
        options: [
          { label: 'USD ($)', value: 'usd' },
          { label: 'EUR (€)', value: 'eur' },
          { label: 'GBP (£)', value: 'gbp' },
          { label: 'CAD ($)', value: 'cad' }
        ],
        isSecret: false
      }
    ]
  },
  {
    id: 'resend',
    label: 'Resend Transactional Email',
    description: 'Order confirmations, shipping notifications, and marketing broadcasts.',
    category: 'email',
    iconName: 'Mail',
    websiteUrl: 'https://resend.com',
    docsUrl: 'https://resend.com/docs',
    supportsTestMode: false,
    capabilities: ['Order Transactional Emails', 'Customer Support Mail', 'DKIM/SPF Verification', 'Analytics'],
    credentials: [
      {
        key: 'RESEND_API_KEY',
        label: 'API Key',
        description: 'Resend authorization key (re_...). Stored write-only.',
        isSecret: true,
        isRequired: true,
        formatPlaceholder: 're_...'
      }
    ],
    variables: [
      {
        key: 'SENDER_DOMAIN',
        label: 'Verified Sender Domain',
        description: 'Domain configured with SPF and DKIM DNS records.',
        type: 'string',
        defaultValue: 'fuelnfreetime.com',
        isSecret: false
      },
      {
        key: 'DEFAULT_FROM_NAME',
        label: 'Default From Name',
        description: 'Display name for outbound notifications.',
        type: 'string',
        defaultValue: 'Fuel & Free Time Support',
        isSecret: false
      }
    ]
  },
  {
    id: 'openai',
    label: 'OpenAI API',
    description: 'GPT-4o, o3 reasoning models, embeddings, and creative generative copy.',
    category: 'ai',
    iconName: 'Sparkles',
    websiteUrl: 'https://openai.com',
    docsUrl: 'https://platform.openai.com/docs',
    supportsTestMode: false,
    capabilities: ['Agent Reasoning', 'Copywriting', 'Product Categorization', 'Embeddings'],
    credentials: [
      {
        key: 'OPENAI_API_KEY',
        label: 'API Secret Key',
        description: 'OpenAI platform secret key (sk-proj-...). Stored write-only.',
        isSecret: true,
        isRequired: true,
        formatPlaceholder: 'sk-proj-...'
      }
    ],
    variables: [
      {
        key: 'DEFAULT_MODEL',
        label: 'Default Model Route',
        description: 'Model assigned to general copywriting tasks.',
        type: 'string',
        defaultValue: 'gpt-4o',
        isSecret: false
      }
    ]
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare Infrastructure',
    description: 'Worker runtime, D1 SQL, R2 object storage, KV store, and Secrets Store.',
    category: 'infrastructure',
    iconName: 'Cloud',
    websiteUrl: 'https://cloudflare.com',
    docsUrl: 'https://developers.cloudflare.com',
    supportsTestMode: false,
    capabilities: ['D1 SQLite Database', 'R2 Media Bucket', 'Secrets Store Vault', 'Edge API Routing'],
    credentials: [
      {
        key: 'CLOUDFLARE_API_TOKEN',
        label: 'Cloudflare API Token',
        description: 'Scoped API token for D1 and R2 management.',
        isSecret: true,
        isRequired: false
      }
    ],
    variables: [
      {
        key: 'ACCOUNT_ID',
        label: 'Cloudflare Account ID',
        description: 'Target Cloudflare account ID.',
        type: 'string',
        defaultValue: 'cf_acct_e938bf832',
        isSecret: false
      },
      {
        key: 'R2_BUCKET_NAME',
        label: 'R2 Media Bucket',
        description: 'Bucket name storing media assets.',
        type: 'string',
        defaultValue: 'fnf-media-production',
        isSecret: false
      }
    ]
  },
  {
    id: 'github',
    label: 'GitHub Integration',
    description: 'Repository automation, deployment commits, and CI/CD version tracking.',
    category: 'source-control',
    iconName: 'GitBranch',
    websiteUrl: 'https://github.com',
    docsUrl: 'https://docs.github.com/en/rest',
    supportsTestMode: false,
    capabilities: ['Theme Sync', 'Automated PRs', 'Build Triggers', 'Commit Verification'],
    credentials: [
      {
        key: 'FNF_GITHUB_TOKEN',
        label: 'Personal Access Token',
        description: 'GitHub fine-grained or repo token. Stored write-only.',
        isSecret: true,
        isRequired: false,
        formatPlaceholder: 'ghp_...'
      }
    ],
    variables: [
      {
        key: 'REPO_NAME',
        label: 'Repository Name',
        description: 'Organization and repository slug.',
        type: 'string',
        defaultValue: 'inneranimal/fuelnfreetime-commerce',
        isSecret: false
      }
    ]
  },
  {
    id: 'inneranimalmedia',
    label: 'Inner Animal Media / AgentSam Platform',
    description: 'Central AgentSam MCP runtime, autonomous commerce tools, SDK entitlements, and managed infrastructure services.',
    category: 'platform',
    iconName: 'Cpu',
    websiteUrl: 'https://inneranimals.com',
    docsUrl: 'https://agentsam.inneranimals.com/docs',
    supportsTestMode: true,
    capabilities: [
      'AgentSam Autonomous Copilot',
      'Inner Animal MCP Server',
      'Cross-Service Commerce Tools',
      'License & Managed Infrastructure',
      'Usage & Billing Entitlements'
    ],
    credentials: [
      {
        key: 'AGENTSAM_BRIDGE_KEY',
        label: 'AgentSam Bridge Secret',
        description: 'Secure handshake token for the Inner Animal MCP bridge.',
        isSecret: true,
        isRequired: true,
        formatPlaceholder: 'iam_bridge_...'
      }
    ],
    variables: [
      {
        key: 'MCP_ENDPOINT_URL',
        label: 'MCP Gateway URL',
        description: 'URL of the AgentSam Model Context Protocol router.',
        type: 'string',
        defaultValue: 'https://mcp.agentsam.inneranimals.com/v1',
        isSecret: false
      },
      {
        key: 'MANAGED_TIER',
        label: 'Subscription Tier',
        description: 'Active Inner Animal Media service tier.',
        type: 'select',
        defaultValue: 'pro_commerce',
        options: [
          { label: 'Community Scaffolding', value: 'community' },
          { label: 'Pro Commerce Managed', value: 'pro_commerce' },
          { label: 'Enterprise Fleet', value: 'enterprise' }
        ],
        isSecret: false
      }
    ]
  }
];
