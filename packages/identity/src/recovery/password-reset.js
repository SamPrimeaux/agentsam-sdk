/**
 * KV-backed password reset (portable). IAM uses SESSION_CACHE + Resend via injectable hooks.
 */

const DEFAULT_PREFIX = 'pwd_reset_v1:';
const DEFAULT_TTL_SEC = 900;
const DEFAULT_MAX_ATTEMPTS = 8;

function randomSixDigitCode() {
  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1000000).padStart(6, '0');
}

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

/**
 * @param {{
 *   kv: { get: (k: string) => Promise<string|null>, put: (k: string, v: string, o?: { expirationTtl?: number }) => Promise<void>, delete: (k: string) => Promise<void> },
 *   findEligibleUser: (email: string) => Promise<{ id: string, email: string, name?: string|null, password_hash?: string|null }|null>,
 *   hashPassword: (password: string) => Promise<{ saltHex: string, hashHex: string }>,
 *   updatePassword: (userId: string, hashHex: string, saltHex: string) => Promise<void>,
 *   sendResetEmail: (args: { email: string, name: string, code: string }) => Promise<void>,
 *   kvPrefix?: string,
 *   ttlSec?: number,
 *   maxAttempts?: number,
 * }} config
 */
export function createPasswordResetService(config) {
  const kv = config.kv;
  const prefix = config.kvPrefix || DEFAULT_PREFIX;
  const ttlSec = config.ttlSec ?? DEFAULT_TTL_SEC;
  const maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  if (!kv?.get || !kv?.put || !kv?.delete) {
    throw new Error('password_reset_requires_kv');
  }

  function kvKey(email) {
    return `${prefix}${normalizeEmail(email)}`;
  }

  function isOAuthOnlyUser(user) {
    return !user || user.password_hash === 'oauth' || !user.password_hash;
  }

  return Object.freeze({
    async requestReset({ email }) {
      const normalized = normalizeEmail(email);
      if (!normalized || !normalized.includes('@')) {
        return { ok: true };
      }
      const user = await config.findEligibleUser(normalized);
      if (isOAuthOnlyUser(user)) {
        return { ok: true };
      }
      const code = randomSixDigitCode();
      await kv.put(
        kvKey(normalized),
        JSON.stringify({ code, exp: Date.now() + ttlSec * 1000, attempts: 0 }),
        { expirationTtl: ttlSec },
      );
      await config.sendResetEmail({
        email: user.email,
        name: user.name || 'there',
        code,
      });
      return { ok: true };
    },

    async confirmReset({ email, code, password, confirmPassword }) {
      const normalized = normalizeEmail(email);
      const normalizedCode = String(code || '').replace(/\s/g, '');
      const pwd = String(password || '');
      const confirm = String(
        confirmPassword ?? password ?? '',
      );
      if (!normalized || !normalizedCode || !pwd) {
        return { ok: false, error: 'Email, code, and password required', status: 400 };
      }
      if (pwd !== confirm) {
        return { ok: false, error: 'Passwords do not match', status: 400 };
      }
      if (pwd.length < 8) {
        return { ok: false, error: 'Password must be at least 8 characters', status: 400 };
      }

      const key = kvKey(normalized);
      const raw = await kv.get(key);
      if (!raw) {
        return { ok: false, error: 'Code expired or invalid. Request a new code.', status: 400 };
      }
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return { ok: false, error: 'Invalid reset state', status: 400 };
      }
      if (Date.now() > payload.exp) {
        await kv.delete(key);
        return { ok: false, error: 'Code expired. Request a new code.', status: 400 };
      }
      if (String(payload.code) !== normalizedCode) {
        payload.attempts = (payload.attempts || 0) + 1;
        if (payload.attempts > maxAttempts) {
          await kv.delete(key);
          return { ok: false, error: 'Too many attempts. Request a new code.', status: 429 };
        }
        await kv.put(key, JSON.stringify(payload), { expirationTtl: ttlSec });
        return { ok: false, error: 'Invalid code', status: 400 };
      }

      const user = await config.findEligibleUser(normalized);
      if (isOAuthOnlyUser(user)) {
        await kv.delete(key);
        return { ok: false, error: 'Account not eligible for password reset', status: 400 };
      }

      const { saltHex, hashHex } = await config.hashPassword(pwd);
      await config.updatePassword(user.id, hashHex, saltHex);
      await kv.delete(key);
      return { ok: true };
    },
  });
}
