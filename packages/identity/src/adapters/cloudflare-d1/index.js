import { SESSION_POLICY } from '../../core/constants.js';
import { IdentitySchemaError } from '../../contracts/identity-store.js';
import { IDENTITY_STORE_SCHEMA_VERSION } from '../../contracts/identity-store.js';
import { newAccountIdentityId, newAuthUserId, newSessionId, newAuthEventId, nowUnix } from './ids.js';
import { DEFAULT_COMPANY_ID, DEFAULT_COMPANY_SLUG, normalizeCompanyRow } from '../../contracts/company.js';


/**
 * @typedef {object} D1Database
 * @property {(sql: string) => { bind: (...args: unknown[]) => { first: () => Promise<unknown>, run: () => Promise<unknown>, all: () => Promise<{ results?: unknown[] }> } }} prepare
 */

/**
 * Portable Cloudflare D1 adapter for customer identity tables.
 * @param {D1Database} db
 * @param {{ sessionTtlSeconds?: number }} [options]
 */
async function hashValue(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  const bytes = new TextEncoder().encode(v);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function createCloudflareD1Adapter(db, options = {}) {
  if (!db?.prepare) {
    throw new Error('cloudflare_d1_adapter_requires_db_binding');
  }
  const sessionTtlSeconds = options.sessionTtlSeconds ?? SESSION_POLICY.browser.ttlSeconds;

  return Object.freeze({
    schemaVersion: IDENTITY_STORE_SCHEMA_VERSION,
    sessionTtlSeconds,
    backend: 'cloudflare-d1',

    /**
     * Append-only login/logout/failed-attempt audit trail (auth_event_log).
     * Never throws — an observability write must not break a real auth flow.
     * status remains the event outcome only ('ok' | 'failed').
     * Richer context (session, capabilities, activity, client) goes in metadata_json.
     * ip/userAgent are hashed (SHA-256) — raw values are never persisted.
     */
    async logAuthEvent({
      userId,
      accountId,
      eventType,
      status = 'ok',
      provider,
      session,
      capabilities,
      activity,
      client,
      metadata,
      request,
    }) {
      try {
        const ip = request?.headers?.get?.('cf-connecting-ip') || request?.headers?.get?.('x-forwarded-for') || '';
        const ua = request?.headers?.get?.('user-agent') || '';
        const [ipHash, uaHash] = await Promise.all([hashValue(ip), hashValue(ua)]);
        const envelope = {
          ...(metadata && typeof metadata === 'object' ? metadata : {}),
          ...(accountId ? { accountId } : {}),
          ...(session ? { session } : {}),
          ...(capabilities ? { capabilities } : {}),
          ...(activity ? { activity } : {}),
          ...(client ? { client } : {}),
        };
        await db.prepare(
          `INSERT INTO auth_event_log
           (id, user_id, event_type, status, provider, metadata_json, ip_hash, user_agent_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          newAuthEventId(),
          userId || null,
          eventType,
          status,
          provider || null,
          JSON.stringify(envelope),
          ipHash,
          uaHash,
        ).run();
      } catch {
        // Never let audit logging break a real login/OAuth flow.
      }
    },

    /**
     * Account/session activity snapshot for auth receipts (not event outcome).
     * @param {string} userId
     */
    async countAuthActivity(userId) {
      if (!userId) {
        return { loginCount: 0, activeSessionCount: 0, lastLoginAt: null };
      }
      try {
        const logins = await db.prepare(
          `SELECT COUNT(*) AS c, MAX(created_at) AS last_at
           FROM auth_event_log
           WHERE user_id = ? AND event_type = 'login' AND status = 'ok'`,
        ).bind(userId).first();
        const sessions = await db.prepare(
          `SELECT COUNT(*) AS c FROM auth_sessions
           WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?`,
        ).bind(userId, nowUnix()).first();
        return {
          loginCount: Number(logins?.c || 0),
          activeSessionCount: Number(sessions?.c || 0),
          lastLoginAt: logins?.last_at != null ? Number(logins.last_at) : null,
        };
      } catch {
        return { loginCount: 0, activeSessionCount: 0, lastLoginAt: null };
      }
    },

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

    async updateUserPassword(userId, passwordHash, salt) {
      const ts = nowUnix();
      await db.prepare(
        `UPDATE auth_users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?`,
      ).bind(passwordHash, salt, ts, userId).run();
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

    async createOAuthTransaction({ state, provider, codeVerifier, returnTo, redirectTo, appId, ttlSeconds = 600 }) {
      if (!appId) {
        throw new IdentitySchemaError(
          'OAUTH_TRANSACTION_APP_ID_REQUIRED',
          'OAuth transactions must include app_id',
        );
      }
      const ts = nowUnix();
      const expiresAt = ts + ttlSeconds;
      try {
        await db.prepare(
          `INSERT INTO identity_oauth_states
           (state, provider, code_verifier, redirect_to, app_id, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(state, provider, codeVerifier, returnTo ?? redirectTo ?? null, appId, expiresAt, ts).run();
      } catch (err) {
        throw new IdentitySchemaError(
          'IDENTITY_SCHEMA_MIGRATION_REQUIRED',
          'identity_oauth_states.app_id required — apply migration 0015 (no silent pre-app_id fallback)',
          { cause: String(err?.message || err) },
        );
      }
    },

    /** @deprecated Use createOAuthTransaction */
    async saveOAuthState(input) {
      return this.createOAuthTransaction(input);
    },

    async consumeOAuthTransaction(state) {
      let row;
      try {
        row = await db.prepare(
          `SELECT state, provider, code_verifier, redirect_to, app_id, expires_at, created_at
           FROM identity_oauth_states WHERE state = ? LIMIT 1`,
        ).bind(state).first();
      } catch (err) {
        throw new IdentitySchemaError(
          'IDENTITY_SCHEMA_MIGRATION_REQUIRED',
          'identity_oauth_states.app_id column missing — apply migration 0015',
          { cause: String(err?.message || err) },
        );
      }
      if (!row) return null;
      await db.prepare(`DELETE FROM identity_oauth_states WHERE state = ?`).bind(state).run();
      if (row.expires_at <= nowUnix()) return null;
      if (!row.app_id) {
        throw new IdentitySchemaError(
          'IDENTITY_SCHEMA_MIGRATION_REQUIRED',
          'OAuth transaction missing app_id — refuse silent pre-app_id semantics',
        );
      }
      return {
        state: row.state,
        provider: row.provider,
        code_verifier: row.code_verifier,
        redirect_to: row.redirect_to,
        return_to: row.redirect_to,
        app_id: row.app_id,
        expires_at: row.expires_at,
        created_at: row.created_at,
      };
    },

    /** @deprecated Use consumeOAuthTransaction */
    async consumeOAuthState(state) {
      return this.consumeOAuthTransaction(state);
    },

    async getCompanyBySlug(slug = DEFAULT_COMPANY_SLUG) {
      const row = await db.prepare(
        `SELECT id, slug, name, legal_name, logo_url, favicon_url, primary_color, auth_bg_color,
                support_email, website_url, tagline, meta_json, created_at, updated_at
         FROM company WHERE slug = ? LIMIT 1`,
      ).bind(slug).first();
      return normalizeCompanyRow(row);
    },

    async getDefaultCompany() {
      const bySlug = await this.getCompanyBySlug(DEFAULT_COMPANY_SLUG);
      if (bySlug) return bySlug;
      const row = await db.prepare(
        `SELECT id, slug, name, legal_name, logo_url, favicon_url, primary_color, auth_bg_color,
                support_email, website_url, tagline, meta_json, created_at, updated_at
         FROM company WHERE id = ? LIMIT 1`,
      ).bind(DEFAULT_COMPANY_ID).first();
      return normalizeCompanyRow(row);
    },

    async upsertCompany(input) {
      const ts = nowUnix();
      const id = input.id || DEFAULT_COMPANY_ID;
      const slug = input.slug || DEFAULT_COMPANY_SLUG;
      const existing = await db.prepare(`SELECT id FROM company WHERE id = ? OR slug = ? LIMIT 1`)
        .bind(id, slug).first();
      const metaJson = input.meta ? JSON.stringify(input.meta) : (input.metaJson ?? null);
      if (existing?.id) {
        await db.prepare(
          `UPDATE company SET
            slug = ?, name = ?, legal_name = ?, logo_url = ?, favicon_url = ?,
            primary_color = ?, auth_bg_color = ?, support_email = ?, website_url = ?,
            tagline = ?, meta_json = ?, updated_at = ?
           WHERE id = ?`,
        ).bind(
          slug,
          input.name,
          input.legalName ?? null,
          input.logoUrl ?? null,
          input.faviconUrl ?? null,
          input.primaryColor ?? null,
          input.authBgColor ?? null,
          input.supportEmail ?? null,
          input.websiteUrl ?? null,
          input.tagline ?? null,
          metaJson,
          ts,
          existing.id,
        ).run();
        return this.getCompanyBySlug(slug);
      }
      await db.prepare(
        `INSERT INTO company
         (id, slug, name, legal_name, logo_url, favicon_url, primary_color, auth_bg_color,
          support_email, website_url, tagline, meta_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        slug,
        input.name,
        input.legalName ?? null,
        input.logoUrl ?? null,
        input.faviconUrl ?? null,
        input.primaryColor ?? null,
        input.authBgColor ?? null,
        input.supportEmail ?? null,
        input.websiteUrl ?? null,
        input.tagline ?? null,
        metaJson,
        ts,
        ts,
      ).run();
      return this.getCompanyBySlug(slug);
    },
  });
}
