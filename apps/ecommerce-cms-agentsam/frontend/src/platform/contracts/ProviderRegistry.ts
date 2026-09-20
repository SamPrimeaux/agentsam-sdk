/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Module: Provider Registry & Integration Architecture
 *
 * Core metadata contracts for the Reusable Provider Center & API Vault.
 * Completeful, Stripe, Resend, OpenAI, Cloudflare, GitHub, and Inner Animal Media
 * all conform to this unified provider model.
 */

import { SecretDescriptor } from './SecretStore';

export type ProviderCategory =
  | 'fulfillment'
  | 'payments'
  | 'email'
  | 'ai'
  | 'storage'
  | 'source-control'
  | 'infrastructure'
  | 'commerce'
  | 'platform';

export interface CredentialDefinition {
  key: string; // e.g. 'CAPP_KEY', 'STRIPE_SECRET_KEY'
  label: string;
  description: string;
  helpText?: string; // alias for description
  isSecret: true;
  isRequired: boolean;
  formatPlaceholder?: string; // e.g. 'capp_test_...'
  validationRegex?: string;
  testModePrefix?: string; // e.g. 'capp_test_'
  liveModePrefix?: string; // e.g. 'capp_live_'
  suggestedDocsUrl?: string;
}

export interface VariableDefinition {
  key: string; // e.g. 'CAPP_API_URL', 'COMPLETEFUL_ALLOW_LIVE_WRITES'
  label: string;
  description: string;
  type: 'string' | 'boolean' | 'number' | 'select';
  defaultValue: any;
  options?: { label: string; value: any }[];
  isSecret: false;
  isRequired?: boolean;
}

export interface WebhookDefinition {
  topic: string;
  label: string;
  description: string;
  signatureHeader: string; // e.g. 'X-Capp-Signature'
  algorithm: 'HMAC-SHA256' | 'ed25519';
}

export interface ProviderDefinition {
  id: string;
  key?: string; // alias for id
  label: string;
  name?: string; // alias for label
  description: string;
  category: ProviderCategory | string;
  logoUrl?: string;
  iconName: string; // Lucide icon name
  websiteUrl: string;
  docsUrl: string;
  documentationUrl?: string; // alias for docsUrl
  supportsTestMode: boolean;
  credentials: CredentialDefinition[];
  requiredSecrets?: { key: string; label: string }[];
  variables: VariableDefinition[];
  capabilities: string[];
  webhookSupport?: WebhookDefinition[];
  supportedWebhooks?: WebhookDefinition[]; // alias for webhookSupport
}

export type ProviderMetadata = ProviderDefinition;

export interface ProviderConnection {
  id: string;
  providerKey: string;
  environment: 'local' | 'preview' | 'production' | string;
  environmentMode?: string; // alias for environment
  status: 'not_configured' | 'configured' | 'verifying' | 'healthy' | 'degraded' | 'error' | 'unconfigured';
  mode: 'test' | 'live';
  config: Record<string, any>;
  credentials: Record<string, SecretDescriptor>;
  lastVerifiedAt?: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastRequestId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface IntegrationActivity {
  id: string;
  provider: string;
  operation: string;
  resourceType: string;
  resourceId?: string;
  status: 'success' | 'failed' | 'warning';
  environment: 'local' | 'preview' | 'production';
  durationMs: number;
  actor: string;
  requestId?: string;
  timestamp: number;
  safeMetadata: Record<string, any>; // NEVER includes auth headers or secret material
  errorMessage?: string;
}

export interface IntegrationWebhook {
  id: string;
  providerKey: string;
  topic: string;
  endpointUrl: string;
  status: 'active' | 'paused' | 'disabled';
  secretLast4: string;
  lastDeliveryAt?: number;
  successCount: number;
  failCount: number;
}
