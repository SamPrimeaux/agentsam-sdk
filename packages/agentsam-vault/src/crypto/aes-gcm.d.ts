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
