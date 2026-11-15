/**
 * Account security primitives shared by every IdentityStore adapter.
 *
 * Backup codes: `XXXX-XXXX-XXXX` from an unambiguous alphabet, stored as the
 * SHA-256 hex digest of the canonical (upper-case, dashed) form only. The
 * plaintext is returned once, at generation, and never persisted.
 *
 * Compatibility: hosts that issued codes before this module hashed the code
 * exactly as displayed (same format, same digest), so canonical hashing matches
 * those rows. Verification also tries the as-entered form for legacy rows.
 */

export const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SEGMENT_LENGTH = 4;
const SEGMENTS = 3;

export class AccountCapabilityError extends Error {
  /**
   * @param {string} code machine-readable error code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'AccountCapabilityError';
    this.code = code;
  }
}

function randomSegment() {
  const bytes = new Uint8Array(SEGMENT_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += BACKUP_CODE_ALPHABET[byte % BACKUP_CODE_ALPHABET.length];
  return out;
}

/** @returns {string} */
export function generateBackupCode() {
  return Array.from({ length: SEGMENTS }, randomSegment).join('-');
}

/** @param {number} [count] @returns {string[]} */
export function generateBackupCodes(count = BACKUP_CODE_COUNT) {
  const codes = new Set();
  while (codes.size < count) codes.add(generateBackupCode());
  return [...codes];
}

/** Canonical form: strip whitespace/dashes, upper-case, re-dash every 4 chars. */
export function canonicalBackupCode(input) {
  const compact = String(input || '').replace(/[\s-]/g, '').toUpperCase();
  if (compact.length !== SEGMENT_LENGTH * SEGMENTS) return null;
  if (!/^[A-Z0-9]+$/.test(compact)) return null;
  return compact.match(new RegExp(`.{${SEGMENT_LENGTH}}`, 'g')).join('-');
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** @param {string} code canonical code */
export async function hashBackupCode(code) {
  return sha256Hex(code);
}

/**
 * Every digest a submitted code may have been stored under.
 * @param {string} input
 * @returns {Promise<string[]>}
 */
export async function backupCodeCandidateHashes(input) {
  const asEntered = String(input || '').replace(/\s/g, '');
  const canonical = canonicalBackupCode(input);
  const forms = new Set([asEntered, canonical].filter(Boolean));
  return Promise.all([...forms].map(sha256Hex));
}

/** Timestamps arrive as unix seconds or ISO/SQL datetime text depending on schema age. */
export function toUnixSeconds(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isFinite(n)) return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  const parsed = Date.parse(String(value).includes('T') ? String(value) : `${String(value).replace(' ', 'T')}Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

/**
 * Public session shape — never includes token hashes or provider subjects.
 * @param {Record<string, unknown>} row
 * @param {string|null} currentSessionId
 */
export function publicSession(row, currentSessionId) {
  return {
    id: String(row.id),
    type: row.type ? String(row.type) : 'browser',
    provider: row.provider ? String(row.provider) : 'email',
    createdAt: toUnixSeconds(row.created_at),
    lastActiveAt: toUnixSeconds(row.last_active_at),
    expiresAt: toUnixSeconds(row.expires_at),
    current: Boolean(currentSessionId && String(row.id) === String(currentSessionId)),
  };
}

const PROFILE_LIMITS = Object.freeze({
  displayName: 80,
  avatarUrl: 2048,
  timezone: 64,
  notificationEmail: 254,
});

/**
 * Validate a profile patch. Unknown fields are ignored; present fields are validated.
 * @param {Record<string, unknown>} body
 * @returns {{ ok: true, patch: Record<string, string|null> } | { ok: false, error: string, field: string }}
 */
export function validateProfilePatch(body = {}) {
  const patch = {};
  const read = (camel, snake) => (camel in body ? body[camel] : snake in body ? body[snake] : undefined);
  const fields = [
    ['displayName', 'display_name'],
    ['avatarUrl', 'avatar_url'],
    ['timezone', 'timezone'],
    ['notificationEmail', 'notification_email'],
  ];
  for (const [camel, snake] of fields) {
    const raw = read(camel, snake);
    if (raw === undefined) continue;
    const value = raw === null ? null : String(raw).trim();
    if (value && value.length > PROFILE_LIMITS[camel]) return { ok: false, error: 'field_too_long', field: camel };
    if (camel === 'displayName' && !value) return { ok: false, error: 'display_name_required', field: camel };
    if (camel === 'avatarUrl' && value && !/^https:\/\//i.test(value)) {
      return { ok: false, error: 'avatar_url_must_be_https', field: camel };
    }
    if (camel === 'notificationEmail' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return { ok: false, error: 'notification_email_invalid', field: camel };
    }
    if (camel === 'timezone' && value) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: value });
      } catch {
        return { ok: false, error: 'timezone_invalid', field: camel };
      }
    }
    patch[camel] = value || null;
  }
  return { ok: true, patch };
}
