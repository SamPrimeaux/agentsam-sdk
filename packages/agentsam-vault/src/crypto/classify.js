import {
  VAULT_FORMAT_CANONICAL,
  VAULT_FORMAT_LEGACY_IAM,
  VAULT_FORMAT_UNKNOWN,
  openVaultSecret,
  probeVaultSecret,
  vaultFormatForMetadata,
  vaultKeyMaterials,
} from './aes-gcm.js';

export const VAULT_ROW_STATUS = Object.freeze({
  canonical_verified: 'canonical_verified',
  legacy_verified: 'legacy_verified',
  provenance_unknown: 'provenance_unknown',
  key_unavailable: 'key_unavailable',
  decrypt_failed: 'decrypt_failed',
  metadata_invalid: 'metadata_invalid',
});

function parseMetadata(raw) {
  if (raw == null || raw === '') return { ok: true, value: null };
  if (typeof raw === 'object') return { ok: true, value: raw };
  try {
    const value = JSON.parse(String(raw));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ok: true, value }
      : { ok: false, value: null };
  } catch {
    return { ok: false, value: null };
  }
}

/**
 * Classify one user_secrets row for the operator diagnostic. Read-only: the plaintext of a
 * successful open is discarded, and nothing secret is ever part of the result. This reports
 * encryption compatibility only, not whether the provider still accepts the credential.
 *
 * @param {{ VAULT_MASTER_KEY?: unknown, VAULT_KEY?: unknown }} env
 * @param {{ secret_value_encrypted: string, metadata_json?: unknown, expires_at?: number|null }} row
 * @param {string} aad canonical AAD (`accountId:service:secretName`)
 * @returns {Promise<{ status: string, format: string, opens_as: string[], expired: boolean }>}
 */
export async function classifyVaultRow(env, row, aad, nowSec = Math.floor(Date.now() / 1000)) {
  const expiresAt = Number(row?.expires_at);
  const expired = Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt < nowSec;
  const meta = parseMetadata(row?.metadata_json);
  const format = meta.ok ? vaultFormatForMetadata(meta.value) : VAULT_FORMAT_UNKNOWN;
  const result = (status, opens = []) => ({ status, format, opens_as: opens, expired });

  const anyMaterial = vaultKeyMaterials(env, VAULT_FORMAT_LEGACY_IAM);
  if (!anyMaterial.length) return result(VAULT_ROW_STATUS.key_unavailable);

  if (format === VAULT_FORMAT_UNKNOWN) {
    // Evidence for the operator only; unknown rows still fail closed in normal reads.
    const probe = await probeVaultSecret(anyMaterial, String(row?.secret_value_encrypted || ''), aad).catch(() => ({}));
    const opens = [VAULT_FORMAT_CANONICAL, VAULT_FORMAT_LEGACY_IAM].filter((f) => probe[f] === true);
    if (!meta.ok) return result(VAULT_ROW_STATUS.metadata_invalid, opens);
    return result(opens.length ? VAULT_ROW_STATUS.provenance_unknown : VAULT_ROW_STATUS.decrypt_failed, opens);
  }

  const materials = vaultKeyMaterials(env, format);
  if (!materials.length) return result(VAULT_ROW_STATUS.key_unavailable);
  try {
    await openVaultSecret(materials, String(row?.secret_value_encrypted || ''), aad, format);
    return result(
      format === VAULT_FORMAT_CANONICAL ? VAULT_ROW_STATUS.canonical_verified : VAULT_ROW_STATUS.legacy_verified,
      [format],
    );
  } catch {
    return result(VAULT_ROW_STATUS.decrypt_failed);
  }
}

/** @param {Array<{ status: string, expired?: boolean }>} items */
export function summarizeVaultReport(items) {
  const counts = {};
  let expired = 0;
  for (const item of items) {
    counts[item.status] = (counts[item.status] || 0) + 1;
    if (item.expired) expired += 1;
  }
  return { inspected: items.length, authenticated: (counts.canonical_verified || 0) + (counts.legacy_verified || 0), expired, by_status: counts };
}
