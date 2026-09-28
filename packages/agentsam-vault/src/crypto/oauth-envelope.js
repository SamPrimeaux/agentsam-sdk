/**
 * Portable OAuth-token envelope for user_oauth_tokens.
 *
 * Compatibility contract:
 * - Key derivation exactly matches IAM backend/credentials/crypto-vault.js:
 *   HKDF-SHA256, 16 zero-byte salt, info "iam-vault-v1", AES-256-GCM.
 * - New rows are v2:<kid>:<base64(iv12 || ciphertext)> and REQUIRE AAD.
 * - Unprefixed rows are legacy IAM ciphertext (same KDF, no AAD).
 *
 * This is intentionally separate from the app-secret vault format. App-local
 * secrets and PKCE state do not need to be readable by another runtime.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
const HKDF_INFO = 'iam-vault-v1';
const V2_PREFIX = 'v2:';

function bytesToB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64ToBytes(value) {
  try {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    const bin = atob(normalized + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    throw vaultError('vault_unseal_failed', 'Invalid OAuth vault base64 payload');
  }
}

function vaultError(code, message, extra = {}) {
  const error = new Error(message || code);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

async function deriveOauthKey(material, usage = ['encrypt', 'decrypt']) {
  const raw = String(material || '').trim();
  if (!raw) throw vaultError('vault_required', 'VAULT_MASTER_KEY is required');
  const base = await crypto.subtle.importKey('raw', enc.encode(raw), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(16),
      info: enc.encode(HKDF_INFO),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  );
}

async function decryptPacked(key, packedB64, aad) {
  const packed = b64ToBytes(packedB64);
  if (packed.byteLength < 13) throw vaultError('vault_unseal_failed', 'invalid encrypted payload');
  const iv = packed.slice(0, 12);
  const ciphertext = packed.slice(12);
  const params = { name: 'AES-GCM', iv };
  if (aad != null) params.additionalData = enc.encode(String(aad));
  try {
    const plain = await crypto.subtle.decrypt(params, key, ciphertext);
    return dec.decode(plain);
  } catch {
    throw vaultError('vault_unseal_failed', 'OAuth vault authentication failed');
  }
}

export async function oauthKeyId(material) {
  const raw = String(material || '').trim();
  if (!raw) throw vaultError('vault_required', 'VAULT_MASTER_KEY is required');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(raw)));
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
  return `k1-${hex.slice(0, 16)}`;
}

export function oauthAad(provider, userId, accountIdentifier) {
  const p = String(provider || '').trim().toLowerCase();
  const uid = String(userId || '').trim();
  const account = String(accountIdentifier || '').trim();
  if (!p || !uid || !account) {
    throw vaultError('vault_aad_required', 'provider, userId, and accountIdentifier are required');
  }
  return `${p}:${uid}:${account}`;
}

export async function sealOauthToken(material, plaintext, aad) {
  if (!String(aad || '')) throw vaultError('vault_aad_required', 'OAuth AAD is required');
  const key = await deriveOauthKey(material, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(String(aad)) },
    key,
    enc.encode(String(plaintext ?? '')),
  );
  const packed = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), iv.byteLength);
  const kid = await oauthKeyId(material);
  return `${V2_PREFIX}${kid}:${bytesToB64(packed)}`;
}

export async function unsealOauthToken(material, blob, aad) {
  const value = String(blob || '').trim();
  if (!value) throw vaultError('vault_unseal_failed', 'OAuth vault payload is empty');
  const key = await deriveOauthKey(material, ['decrypt']);

  if (!value.startsWith(V2_PREFIX)) {
    // Legacy IAM format: HKDF-derived AES-GCM with no AAD.
    return decryptPacked(key, value, null);
  }

  const first = value.indexOf(':', V2_PREFIX.length);
  if (first < 0) throw vaultError('vault_unseal_failed', 'Malformed v2 OAuth vault envelope');
  const storedKid = value.slice(V2_PREFIX.length, first);
  const packed = value.slice(first + 1);
  const currentKid = await oauthKeyId(material);
  if (storedKid !== currentKid) {
    throw vaultError('vault_kid_mismatch', 'OAuth vault key id mismatch', {
      storedKeyId: storedKid,
      currentKeyId: currentKid,
    });
  }
  if (!String(aad || '')) throw vaultError('vault_aad_required', 'OAuth AAD is required');
  return decryptPacked(key, packed, String(aad));
}

/** Test/migration helper: emit the legacy IAM no-AAD format. */
export async function sealLegacyIamOauthToken(material, plaintext) {
  const key = await deriveOauthKey(material, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(String(plaintext ?? '')),
  );
  const packed = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), iv.byteLength);
  return bytesToB64(packed);
}
