/**
 * AES-256-GCM vault crypto.
 * VAULT_MASTER_KEY must be an explicit versioned 32-byte key:
 *   v1.<base64|base64url of exactly 32 bytes>
 *
 * No silent truncate / hash of arbitrary strings.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64ToBytes(b64) {
  const normalized = String(b64).replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const bin = atob(normalized + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * Parse VAULT_MASTER_KEY into raw 32 bytes.
 * @param {string} rawMasterKey
 * @returns {Uint8Array}
 */
export function parseVaultMasterKeyBytes(rawMasterKey) {
  const raw = String(rawMasterKey || '').trim();
  if (!raw) throw new Error('VAULT_MASTER_KEY_MISSING');
  if (!raw.startsWith('v1.')) {
    throw new Error(
      'VAULT_MASTER_KEY_INVALID_FORMAT: expected v1.<base64-32-bytes> (generate: openssl rand -base64 32 | sed "s|^|v1.|")',
    );
  }
  const payload = raw.slice(3);
  let keyBytes;
  try {
    keyBytes = b64ToBytes(payload);
  } catch {
    throw new Error('VAULT_MASTER_KEY_INVALID_BASE64');
  }
  if (keyBytes.byteLength !== 32) {
    throw new Error(
      `VAULT_MASTER_KEY_INVALID_LENGTH: got ${keyBytes.byteLength} bytes, need exactly 32`,
    );
  }
  return keyBytes;
}

/**
 * @param {string} rawMasterKey
 */
export async function importVaultMasterKey(rawMasterKey) {
  const keyBytes = parseVaultMasterKeyBytes(rawMasterKey);
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Mint a new versioned master key string for wrangler secret put.
 */
export function mintVaultMasterKeyV1() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `v1.${bytesToB64(bytes)}`;
}

export async function encryptVaultSecret(key, plaintext, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad) },
    key,
    enc.encode(plaintext),
  );
  const packed = new Uint8Array(iv.byteLength + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.byteLength);
  return bytesToB64(packed);
}

export async function decryptVaultSecret(key, packedB64, aad) {
  const packed = b64ToBytes(packedB64);
  const iv = packed.slice(0, 12);
  const data = packed.slice(12);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad) },
    key,
    data,
  );
  return dec.decode(plain);
}

export function last4(value) {
  const v = String(value ?? '');
  if (!v) return '';
  return v.length <= 4 ? '••••' : v.slice(-4);
}

export function makeCredentialRef({ backend = 'vault', id }) {
  return `${backend}:${id}`;
}
