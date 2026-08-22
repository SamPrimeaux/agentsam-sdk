import { newAccountIdentityId, newAuthUserId, newSessionId, nowUnix } from './ids.js';
import { AUTH_SESSION_TTL_SECONDS } from '../../core/constants.js';

/**
 * @typedef {object} D1Database
 * @property {(sql: string) => { bind: (...args: unknown[]) => { first: () => Promise<unknown>, run: () => Promise<unknown>, all: () => Promise<{ results?: unknown[] }> } }} prepare
 */

/**
 * Portable Cloudflare D1 adapter for customer identity tables.
 * @param {D1Database} db
 * @param {{ sessionTtlSeconds?: number }} [options]
 */
export function createCloudflareD1Adapter(db, options = {}) {
  if (!db?.prepare) {
    throw new Error('cloudflare_d1_adapter_requires_db_binding');
  }
  const sessionTtlSeconds = options.sessionTtlSeconds ?? AUTH_SESSION_TTL_SECONDS;

  return Object.freeze({
    sessionTtlSeconds,

    async findUserByEmail(email) {
      const row = await db.prepare(
        `SELECT id, email, display_name, password_hash, salt, status, created_at, updated_at
         FROM auth_users WHERE email = ? COLLATE NOCASE LIMIT 1`,
      ).bind(String(email || '').trim().toLowerCase()).first();
      return row || null;
    },

    async findUserById(userId) {
      const row = await db.prepare(
        `SELECT id, email, display_name, password_hash, salt, status, created_at, updated_at
         FROM auth_users WHERE id = ? LIMIT 1`,
      ).bind(userId).first();
      return row || null;
    },

    async createUser({ email, passwordHash, salt, displayName }) {
      const id = newAuthUserId();
      const ts = nowUnix();
      const normalizedEmail = String(email || '').trim().toLowerCase();
      await db.prepare(
        `INSERT INTO auth_users (id, email, display_name, password_hash, salt, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      ).bind(id, normalizedEmail, displayName || null, passwordHash || null, salt || null, ts, ts).run();
      return this.findUserById(id);
    },

    async findUserByProvider(provider, providerSubject) {
      const row = await db.prepare(
        `SELECT u.id, u.email, u.display_name, u.password_hash, u.salt, u.status, u.created_at, u.updated_at
         FROM account_identities ai
         JOIN auth_users u ON u.id = ai.account_id
         WHERE ai.provider = ? AND ai.provider_subject = ?
         LIMIT 1`,
      ).bind(provider, providerSubject).first();
      return row || null;
    },

    async upsertProviderIdentity({ accountId, provider, providerSubject, email }) {
      const existing = await db.prepare(
        `SELECT id FROM account_identities WHERE provider = ? AND provider_subject = ? LIMIT 1`,
      ).bind(provider, providerSubject).first();
      const ts = nowUnix();
      if (existing?.id) {
        await db.prepare(
          `UPDATE account_identities SET account_id = ?, email = ?, updated_at = ? WHERE id = ?`,
        ).bind(accountId, email || null, ts, existing.id).run();
        return existing.id;
      }
      const id = newAccountIdentityId();
      await db.prepare(
        `INSERT INTO account_identities (id, account_id, provider, provider_subject, email, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, accountId, provider, providerSubject, email || null, ts, ts).run();
      return id;
    },

    async createSession({ userId, email, provider, providerSubject, displayName }) {
      const id = newSessionId();
      const ts = nowUnix();
      const expiresAt = ts + sessionTtlSeconds;
      await db.prepare(
        `INSERT INTO auth_sessions
         (id, user_id, email, provider, provider_subject, display_name, expires_at, created_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        userId,
        email || null,
        provider || 'email',
        providerSubject || null,
        displayName || null,
        expiresAt,
        ts,
        ts,
      ).run();
      return {
        id,
        user_id: userId,
        email,
        provider: provider || 'email',
        provider_subject: providerSubject || null,
        display_name: displayName || null,
        expires_at: expiresAt,
        created_at: ts,
      };
    },

    async getSession(sessionId) {
      const row = await db.prepare(
        `SELECT id, user_id, email, provider, provider_subject, display_name, expires_at, revoked_at, created_at, last_active_at
         FROM auth_sessions WHERE id = ? LIMIT 1`,
      ).bind(sessionId).first();
      if (!row) return null;
      if (row.revoked_at) return null;
      if (row.expires_at <= nowUnix()) return null;
      return row;
    },

    async revokeSession(sessionId, reason = 'logout') {
      const ts = nowUnix();
      await db.prepare(
        `UPDATE auth_sessions SET revoked_at = ?, last_active_at = ? WHERE id = ? AND revoked_at IS NULL`,
      ).bind(ts, ts, sessionId).run();
      return { ok: true, reason };
    },

    async saveOAuthState({ state, provider, codeVerifier, redirectTo, ttlSeconds = 600 }) {
      const ts = nowUnix();
      await db.prepare(
        `INSERT INTO oauth_states (state, provider, code_verifier, redirect_to, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(state, provider, codeVerifier, redirectTo || null, ts + ttlSeconds, ts).run();
    },

    async consumeOAuthState(state) {
      const row = await db.prepare(
        `SELECT state, provider, code_verifier, redirect_to, expires_at FROM oauth_states WHERE state = ? LIMIT 1`,
      ).bind(state).first();
      if (!row) return null;
      await db.prepare(`DELETE FROM oauth_states WHERE state = ?`).bind(state).run();
      if (row.expires_at <= nowUnix()) return null;
      return row;
    },
  });
}
