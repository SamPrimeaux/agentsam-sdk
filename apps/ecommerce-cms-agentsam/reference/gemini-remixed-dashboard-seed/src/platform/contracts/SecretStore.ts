/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Module: Secret Store Contract
 *
 * Pluggable backend for secure credential management.
 * In accordance with strict security requirements:
 * 1. Plaintext secrets are WRITE-ONLY from the UI.
 * 2. Raw secrets are NEVER returned to the browser.
 * 3. Only metadata (last4, status, secretRef, expiration, scopes) is exposed to the frontend.
 */

export type SecretBackendType =
  | 'cloudflare_secrets_store'
  | 'worker_secret'
  | 'encrypted_d1'
  | 'local_env'
  | 'vault_external';

export interface SecretMetadataInput {
  account_id: string;
  provider: string; // e.g. 'completeful', 'stripe', 'resend', 'openai', 'github'
  environment: 'local' | 'preview' | 'production';
  credential_key: string; // e.g. 'CAPP_KEY', 'STRIPE_SECRET_KEY'
  secret_value: string; // write-only payload from admin
  scopes?: string[];
  expires_at?: number;
  description?: string;
}

export interface SecretDescriptor {
  id: string;
  account_id: string;
  provider: string;
  environment: 'local' | 'preview' | 'production';
  credential_key: string;
  keyName?: string; // alias for credential_key
  storage_backend: SecretBackendType;
  secret_ref: string; // opaque identifier
  last4: string; // e.g. '7ac2'
  status: 'healthy' | 'unverified' | 'expired' | 'revoked';
  scopes: string[];
  expires_at?: number;
  created_at: number;
  updated_at: number;
  rotatedAt?: number; // alias for updated_at
  last_verified_at?: number;
  created_by?: string;
  updated_by?: string;
}

export interface SecretStoreAdapter {
  /**
   * Store or update a secret. Returns the non-sensitive metadata descriptor.
   */
  putSecret: (input: SecretMetadataInput) => Promise<SecretDescriptor>;

  /**
   * Rotate an existing secret with a new value without needing to inspect the previous value.
   */
  rotateSecret: (input: SecretMetadataInput) => Promise<SecretDescriptor>;

  /**
   * Delete a secret reference and underlying vault asset.
   */
  deleteSecret: (params: { provider: string; credential_key: string; environment?: string }) => Promise<void>;

  /**
   * Describe existing secret metadata (NEVER returns secret_value).
   */
  describeSecret: (params: { provider: string; credential_key: string; environment?: string }) => Promise<SecretDescriptor | null>;

  /**
   * Check if a secret exists.
   */
  exists: (params: { provider: string; credential_key: string; environment?: string }) => Promise<boolean>;

  /**
   * Verify credential against provider API (safe read/handshake).
   */
  verifySecret: (params: { provider: string; credential_key: string; environment?: string }) => Promise<{
    valid: boolean;
    status: 'healthy' | 'degraded' | 'error';
    message: string;
    testedAt: number;
  }>;
}

/**
 * SecretStore Interface
 * Primary contract for the write-only vault subsystem in @inneranimalmedia/ecommerce-cms-agentsam.
 * Guarantees sensitive plaintext keys never leak into the application state or client network traffic.
 */
export interface SecretStore extends SecretStoreAdapter {
  /**
   * List non-sensitive descriptors for all registered credentials or filtered by provider.
   */
  listDescriptors: (params?: { provider?: string; environment?: string }) => Promise<SecretDescriptor[]>;

  /**
   * Safe handle resolution for backend Worker execution (e.g. inject into upstream fetch header).
   * Notice: In the browser or untrusted context, this returns an opaque handle or throws.
   */
  resolveSecret?: (params: { provider: string; credential_key: string; environment?: string }) => Promise<{
    secret_ref: string;
    maskedLast4: string;
  }>;
}
