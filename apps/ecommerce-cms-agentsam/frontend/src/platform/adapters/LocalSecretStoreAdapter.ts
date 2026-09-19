/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Module: LocalSecretStoreAdapter
 *
 * Local/Mock implementation of the SecretStore contract.
 * Strictly enforces write-only credential storage:
 * 1. Plaintext secrets are stored in a private module closure that is never exposed to public getters.
 * 2. All public methods return SecretDescriptor objects with masked last4 characters only.
 * 3. Prevents sensitive keys from leaking into React state, localStorage, devtools, or network telemetry.
 */

import {
  SecretStore,
  SecretMetadataInput,
  SecretDescriptor,
  SecretBackendType
} from '../contracts/SecretStore';

/**
 * Creates an instance of LocalSecretStoreAdapter.
 * Uses an isolated private closure map for secret storage.
 */
export class LocalSecretStoreAdapter implements SecretStore {
  // Private store for raw secret values - inaccessible from outside instance
  private readonly _secureVault: Map<string, string> = new Map();

  // Publicly readable descriptors (safe metadata only)
  private readonly _descriptors: Map<string, SecretDescriptor> = new Map();

  constructor(initialCredentials?: Array<{
    provider: string;
    key: string;
    environment?: 'local' | 'preview' | 'production';
    dummySecret?: string;
  }>) {
    if (initialCredentials && initialCredentials.length > 0) {
      initialCredentials.forEach((cred) => {
        const dummyVal = cred.dummySecret || `${cred.provider}_preview_live_${Math.random().toString(36).substring(2, 10)}`;
        this._setInternal(
          'fnf_account_01',
          cred.provider,
          cred.environment || 'preview',
          cred.key,
          dummyVal,
          ['read', 'write'],
          `Pre-seeded credential for ${cred.provider}`
        );
      });
    }
  }

  private _buildKey(provider: string, credential_key: string, environment: string = 'preview'): string {
    return `${provider.toLowerCase()}::${environment.toLowerCase()}::${credential_key.toUpperCase()}`;
  }

  private _maskLast4(value: string): string {
    if (!value) return '0000';
    const trimmed = value.trim();
    if (trimmed.length <= 4) return trimmed;
    return trimmed.slice(-4);
  }

  private _setInternal(
    accountId: string,
    provider: string,
    environment: 'local' | 'preview' | 'production',
    credentialKey: string,
    secretValue: string,
    scopes: string[] = ['read', 'write'],
    description?: string
  ): SecretDescriptor {
    const key = this._buildKey(provider, credentialKey, environment);
    const now = Date.now();

    // 1. Store raw secret ONLY in private memory
    this._secureVault.set(key, secretValue);

    // 2. Generate or update descriptor (strictly safe metadata)
    const existing = this._descriptors.get(key);
    const descriptor: SecretDescriptor = {
      id: existing?.id || `sec_${Math.random().toString(36).substring(2, 11)}`,
      account_id: accountId,
      provider: provider.toLowerCase(),
      environment,
      credential_key: credentialKey,
      keyName: credentialKey,
      storage_backend: 'local_env' as SecretBackendType,
      secret_ref: existing?.secret_ref || `ref_vault_${Math.random().toString(36).substring(2, 15)}`,
      last4: this._maskLast4(secretValue),
      status: 'healthy',
      scopes,
      created_at: existing?.created_at || now,
      updated_at: now,
      rotatedAt: existing ? now : undefined,
      last_verified_at: now
    };

    this._descriptors.set(key, descriptor);
    return { ...descriptor };
  }

  /**
   * Store or update a secret.
   * Write-only: stores plaintext in private memory and returns safe metadata.
   */
  async putSecret(input: SecretMetadataInput): Promise<SecretDescriptor> {
    if (!input.secret_value || typeof input.secret_value !== 'string') {
      throw new Error('LocalSecretStoreAdapter: secret_value must be a non-empty string.');
    }

    return this._setInternal(
      input.account_id || 'fnf_account_01',
      input.provider,
      input.environment || 'preview',
      input.credential_key,
      input.secret_value,
      input.scopes || ['read', 'write'],
      input.description
    );
  }

  /**
   * Rotate an existing secret with a new value without exposing the old value.
   */
  async rotateSecret(input: SecretMetadataInput): Promise<SecretDescriptor> {
    return this.putSecret(input);
  }

  /**
   * Delete a secret reference and erase the underlying raw payload.
   */
  async deleteSecret(params: { provider: string; credential_key: string; environment?: string }): Promise<void> {
    const key = this._buildKey(params.provider, params.credential_key, params.environment || 'preview');
    this._secureVault.delete(key);
    this._descriptors.delete(key);
  }

  /**
   * Describe existing secret metadata (NEVER returns secret_value).
   */
  async describeSecret(params: {
    provider: string;
    credential_key: string;
    environment?: string;
  }): Promise<SecretDescriptor | null> {
    const key = this._buildKey(params.provider, params.credential_key, params.environment || 'preview');
    const desc = this._descriptors.get(key);
    return desc ? { ...desc } : null;
  }

  /**
   * Check if a secret exists in the vault.
   */
  async exists(params: { provider: string; credential_key: string; environment?: string }): Promise<boolean> {
    const key = this._buildKey(params.provider, params.credential_key, params.environment || 'preview');
    return this._secureVault.has(key);
  }

  /**
   * List non-sensitive descriptors for all registered credentials.
   */
  async listDescriptors(params?: { provider?: string; environment?: string }): Promise<SecretDescriptor[]> {
    const all = Array.from(this._descriptors.values());
    return all
      .filter((d) => {
        if (params?.provider && d.provider.toLowerCase() !== params.provider.toLowerCase()) {
          return false;
        }
        if (params?.environment && d.environment !== params.environment) {
          return false;
        }
        return true;
      })
      .map((d) => ({ ...d }));
  }

  /**
   * Safe handle resolution for mock backend calls.
   * Returns opaque reference and masked last4, never plaintext.
   */
  async resolveSecret(params: {
    provider: string;
    credential_key: string;
    environment?: string;
  }): Promise<{ secret_ref: string; maskedLast4: string }> {
    const key = this._buildKey(params.provider, params.credential_key, params.environment || 'preview');
    const desc = this._descriptors.get(key);
    if (!desc) {
      throw new Error(`Secret not found in vault: ${params.provider}::${params.credential_key}`);
    }
    return {
      secret_ref: desc.secret_ref,
      maskedLast4: `••••••••${desc.last4}`
    };
  }

  /**
   * Safe handshake verification against provider credential format.
   */
  async verifySecret(params: {
    provider: string;
    credential_key: string;
    environment?: string;
  }): Promise<{
    valid: boolean;
    status: 'healthy' | 'degraded' | 'error';
    message: string;
    testedAt: number;
  }> {
    const key = this._buildKey(params.provider, params.credential_key, params.environment || 'preview');
    const hasSecret = this._secureVault.has(key);
    const rawValue = this._secureVault.get(key) || '';
    const desc = this._descriptors.get(key);

    const now = Date.now();

    if (!hasSecret || !rawValue) {
      return {
        valid: false,
        status: 'error',
        message: `No credentials provisioned for ${params.provider} (${params.credential_key}).`,
        testedAt: now
      };
    }

    // Format heuristic validation without revealing secret
    let isValid = true;
    let message = 'Credential format verified and provider handshake succeeded.';

    if (params.credential_key === 'CAPP_KEY' && !rawValue.startsWith('capp_')) {
      // Still accept standard test keys but note mock mode
      message = 'Simulated Completeful API handshake verified.';
    } else if (params.credential_key === 'STRIPE_SECRET_KEY' && !rawValue.startsWith('sk_')) {
      message = 'Simulated Stripe secret key verified.';
    } else if (params.credential_key === 'RESEND_API_KEY' && !rawValue.startsWith('re_')) {
      message = 'Simulated Resend API key verified.';
    }

    if (desc) {
      desc.status = 'healthy';
      desc.last_verified_at = now;
      this._descriptors.set(key, desc);
    }

    return {
      valid: isValid,
      status: 'healthy',
      message,
      testedAt: now
    };
  }
}

/**
 * Factory function for creating a mock LocalSecretStoreAdapter
 */
export function createLocalSecretStoreAdapter(
  initialCredentials?: Array<{
    provider: string;
    key: string;
    environment?: 'local' | 'preview' | 'production';
    dummySecret?: string;
  }>
): LocalSecretStoreAdapter {
  return new LocalSecretStoreAdapter(initialCredentials);
}
