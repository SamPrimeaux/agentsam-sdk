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


/**
 * Multi-format opener for user_secrets rows.
 *
 * Rows in a shared D1 table can come from more than one writer:
 *   v1-aad       canonical: raw 32-byte `v1.<b64>` key, AAD-bound
 *   v1-noaad     canonical key, no AAD
 *   hkdf-noaad   legacy IAM: HKDF-SHA256(salt=16 zero bytes, info "iam-vault-v1") over the
 *                env string, no AAD (same KDF as the OAuth envelope in oauth-envelope.js)
 *   hkdf-aad     HKDF key, AAD-bound
 * Reads never rewrite rows; the format is reported so callers can decide.
 */
const LEGACY_HKDF_INFO = 'iam-vault-v1';

async function deriveHkdfKey(material) {
  const base = await crypto.subtle.importKey('raw', enc.encode(material), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(16), info: enc.encode(LEGACY_HKDF_INFO) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}

async function openPacked(key, packedB64, aad) {
  const packed = b64ToBytes(packedB64);
  if (packed.byteLength < 13) throw new Error('VAULT_PAYLOAD_INVALID');
  const params = { name: 'AES-GCM', iv: packed.slice(0, 12) };
  if (aad != null) params.additionalData = enc.encode(String(aad));
  return dec.decode(await crypto.subtle.decrypt(params, key, packed.slice(12)));
}

async function vaultOpenAttempts(masterKeyMaterial, aad) {
  const raw = String(masterKeyMaterial || '').trim();
  if (!raw) throw new Error('VAULT_MASTER_KEY_MISSING');
  const attempts = [];
  try {
    const k = await importVaultMasterKey(raw);
    attempts.push(['v1-aad', k, aad], ['v1-noaad', k, null]);
  } catch {
    /* not a v1 key; legacy derivations below may still apply */
  }
  const materials = raw.startsWith('v1.') ? [raw, raw.slice(3)] : [raw];
  for (const m of materials) {
    const k = await deriveHkdfKey(m);
    attempts.push(['hkdf-noaad', k, null], ['hkdf-aad', k, aad]);
  }
  return attempts;
}

/**
 * @param {string} masterKeyMaterial
 * @param {string} packedB64
 * @param {string} aad canonical AAD (`accountId:service:secretName`)
 * @returns {Promise<{ value: string, format: string }>}
 */
export async function openVaultSecret(masterKeyMaterial, packedB64, aad) {
  for (const [format, key, a] of await vaultOpenAttempts(masterKeyMaterial, aad)) {
    try {
      return { value: await openPacked(key, packedB64, a), format };
    } catch {
      /* try next format */
    }
  }
  const err = new Error('VAULT_DECRYPT_FAILED: no known format/key/AAD combination opens this row');
  err.code = 'vault_decrypt_failed';
  throw err;
}

/**
 * Diagnostic: which formats open this row. Never returns plaintext.
 * @returns {Promise<Record<string, boolean>>}
 */
export async function probeVaultSecret(masterKeyMaterial, packedB64, aad) {
  const out = {};
  for (const [format, key, a] of await vaultOpenAttempts(masterKeyMaterial, aad)) {
    try {
      await openPacked(key, packedB64, a);
      out[format] = true;
    } catch {
      out[format] ??= false;
    }
  }
  return out;
}

export function last4(value) {
  const v = String(value ?? '');
  if (!v) return '';
  return v.length <= 4 ? '••••' : v.slice(-4);
}

export function makeCredentialRef({ backend = 'vault', id }) {
  return `${backend}:${id}`;
}
