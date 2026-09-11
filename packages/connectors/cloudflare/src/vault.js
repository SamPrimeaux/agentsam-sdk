/**
 * AES-256-GCM token vault matching apps/local-studio/backend/worker encryptSecret.
 * Connector tokens are server-only. Never return plaintext on status routes.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64ToBytes(value) {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function vaultConfigured(env = {}) {
  return Boolean(env.VAULT_MASTER_KEY || env.VAULT_KEY);
}

async function importVaultKey(env) {
  const raw = env.VAULT_MASTER_KEY || env.VAULT_KEY;
  if (!raw) throw new Error('VAULT_MASTER_KEY missing');
  let keyBytes;
  try {
    keyBytes = b64ToBytes(raw);
  } catch {
    keyBytes = enc.encode(raw);
  }
  if (keyBytes.byteLength === 32) {
    // ok
  } else if (keyBytes.byteLength > 32) {
    keyBytes = keyBytes.slice(0, 32);
  } else {
    const hash = await crypto.subtle.digest('SHA-256', keyBytes);
    keyBytes = new Uint8Array(hash);
  }
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(env, plaintext, aad) {
  const key = await importVaultKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad || '') },
    key,
    enc.encode(plaintext),
  );
  const packed = new Uint8Array(iv.byteLength + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.byteLength);
  return bytesToB64(packed);
}

export async function decryptSecret(env, packedB64, aad) {
  const key = await importVaultKey(env);
  const packed = b64ToBytes(packedB64);
  const iv = packed.slice(0, 12);
  const data = packed.slice(12);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad || '') },
    key,
    data,
  );
  return dec.decode(plain);
}

export async function sealToken(env, plaintext, aad) {
  if (!plaintext) return null;
  if (!vaultConfigured(env)) {
    const err = new Error('vault_unavailable');
    err.code = 'vault_unavailable';
    throw err;
  }
  return encryptSecret(env, plaintext, aad);
}
