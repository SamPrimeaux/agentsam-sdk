/**
 * Type declarations for `@inneranimalmedia/agentsam-vault/crypto`.
 * Runtime stays plain JS (Workers + Node); this file is for TS consumers only.
 */

export function parseVaultMasterKeyBytes(rawMasterKey: string): Uint8Array;

export function importVaultMasterKey(rawMasterKey: string): Promise<CryptoKey>;

/** Mint `v1.<base64-32-bytes>` for wrangler secret put. */
export function mintVaultMasterKeyV1(): string;

export function encryptVaultSecret(
  key: CryptoKey,
  plaintext: string,
  aad: string,
): Promise<string>;

export function decryptVaultSecret(
  key: CryptoKey,
  packedB64: string,
  aad: string,
): Promise<string>;

export function last4(value: unknown): string;

export function makeCredentialRef(input: {
  backend?: string;
  id: string;
}): string;

export const VAULT_FORMAT_CANONICAL: "v1-aad";
export const VAULT_FORMAT_LEGACY_IAM: "hkdf-noaad";
export function vaultFormatForMetadata(metadata: unknown): string;
export function openVaultSecret(
  masterKeyMaterials: string | string[],
  packedB64: string,
  aad: string,
  format?: string,
): Promise<{ value: string; format: string }>;
export function probeVaultSecret(
  masterKeyMaterials: string | string[],
  packedB64: string,
  aad: string,
): Promise<{ "v1-aad": boolean; "hkdf-noaad": boolean }>;
