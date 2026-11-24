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
 * Row-format-gated opener for user_secrets.
 *
 * Two formats exist, and a row's format is decided by its provenance, never by trial:
 *   v1-aad      canonical: raw 32-byte `v1.<b64>` key, AAD = account:service:name.
 *               Written by every current writer, which marks the row aad_bound.
 *   hkdf-noaad  legacy IAM: HKDF-SHA256(salt 16 zero bytes, info "iam-vault-v1") over the env
 *               string, no AAD. Rows without the aad_bound marker (migrated user_api_keys
 *               rows and older IAM-written rows).
 * A canonical row is never opened without its AAD. Unknown/failed rows throw.
 */
export const VAULT_FORMAT_CANONICAL = 'v1-aad';
export const VAULT_FORMAT_LEGACY_IAM = 'hkdf-noaad';
const LEGACY_HKDF_INFO = 'iam-vault-v1';

export const VAULT_FORMAT_UNKNOWN = 'unknown';

/**
 * Format of a row from its persisted provenance (metadata_json). Never guessed:
 *   crypto_format      explicit and authoritative once a verified migration sets it
 *   aad_bound          written by a current canonical writer -> v1-aad
 *   migrated_from      imported legacy IAM row -> hkdf-noaad
 * Anything else (missing, malformed, unmarked) is `unknown` and fails closed until classified.
 * @param {unknown} metadata parsed object or JSON string from user_secrets.metadata_json
 */
export function vaultFormatForMetadata(metadata) {
  let m = metadata;
  if (typeof m === 'string') {
    try {
      m = JSON.parse(m);
    } catch {
      return VAULT_FORMAT_UNKNOWN;
    }
  }
  if (!m || typeof m !== 'object') return VAULT_FORMAT_UNKNOWN;
  if (m.crypto_format === VAULT_FORMAT_CANONICAL || m.crypto_format === VAULT_FORMAT_LEGACY_IAM) return m.crypto_format;
  if (m.aad_bound === true || m.aad_bound === 1) return VAULT_FORMAT_CANONICAL;
  if (typeof m.migrated_from === 'string' && m.migrated_from.trim()) return VAULT_FORMAT_LEGACY_IAM;
  return VAULT_FORMAT_UNKNOWN;
}

/**
 * The one place that decides which key material may open which format. Canonical rows use
 * VAULT_MASTER_KEY only; legacy IAM rows were keyed by VAULT_MASTER_KEY || VAULT_KEY.
 * @param {{ VAULT_MASTER_KEY?: unknown, VAULT_KEY?: unknown }} env
 */
export function vaultKeyMaterials(env, format) {
  const clean = (v) => String(v ?? '').trim();
  const master = clean(env?.VAULT_MASTER_KEY);
  if (format === VAULT_FORMAT_CANONICAL) return master ? [master] : [];
  if (format === VAULT_FORMAT_LEGACY_IAM) return [master, clean(env?.VAULT_KEY)].filter(Boolean);
  return [];
}

/**
 * Open a user_secrets row using its own provenance. Throws on unknown provenance.
 * @param {{ VAULT_MASTER_KEY?: unknown, VAULT_KEY?: unknown }} env
 * @param {{ secret_value_encrypted: string, metadata_json?: unknown }} row
 */
export async function openVaultRow(env, row, aad) {
  const format = vaultFormatForMetadata(row?.metadata_json);
  if (format === VAULT_FORMAT_UNKNOWN) {
    const err = new Error('VAULT_PROVENANCE_UNKNOWN: row has no verified format marker');
    err.code = 'vault_provenance_unknown';
    throw err;
  }
  return openVaultSecret(vaultKeyMaterials(env, format), row.secret_value_encrypted, aad, format);
}

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

function materialList(materials) {
  return [...new Set((Array.isArray(materials) ? materials : [materials]).map((m) => String(m || '').trim()).filter(Boolean))];
}

async function openAs(format, materials, packedB64, aad) {
  const list = materialList(materials);
  if (!list.length) throw new Error('VAULT_MASTER_KEY_MISSING');
  if (format === VAULT_FORMAT_CANONICAL) {
    return openPacked(await importVaultMasterKey(list[0]), packedB64, aad);
  }
  if (format !== VAULT_FORMAT_LEGACY_IAM) throw new Error(`VAULT_FORMAT_UNKNOWN: ${format}`);
  // Legacy IAM keyed off the literal env string; also accept it without the `v1.` prefix.
  for (const material of list) {
    for (const m of material.startsWith('v1.') ? [material, material.slice(3)] : [material]) {
      try {
        return await openPacked(await deriveHkdfKey(m), packedB64, null);
      } catch {
        /* next candidate */
      }
    }
  }
  throw new Error('VAULT_DECRYPT_FAILED');
}

/**
 * @param {string | string[]} masterKeyMaterials canonical uses the first; legacy tries all
 * @param {string} packedB64
 * @param {string} aad canonical AAD (`accountId:service:secretName`)
 * @param {string} format VAULT_FORMAT_CANONICAL | VAULT_FORMAT_LEGACY_IAM (see vaultFormatForMetadata)
 * @returns {Promise<{ value: string, format: string }>}
 */
export async function openVaultSecret(masterKeyMaterials, packedB64, aad, format = VAULT_FORMAT_CANONICAL) {
  try {
    return { value: await openAs(format, masterKeyMaterials, packedB64, aad), format };
  } catch (cause) {
    const err = new Error(`VAULT_DECRYPT_FAILED: row did not open as ${format}`);
    err.code = 'vault_decrypt_failed';
    err.format = format;
    err.cause = cause;
    throw err;
  }
}

/**
 * Diagnostic: which of the two known formats open this row. Never returns plaintext.
 * @returns {Promise<{ 'v1-aad': boolean, 'hkdf-noaad': boolean }>}
 */
export async function probeVaultSecret(masterKeyMaterials, packedB64, aad) {
  const out = {};
  for (const format of [VAULT_FORMAT_CANONICAL, VAULT_FORMAT_LEGACY_IAM]) {
    try {
      await openAs(format, masterKeyMaterials, packedB64, aad);
      out[format] = true;
    } catch {
      out[format] = false;
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
