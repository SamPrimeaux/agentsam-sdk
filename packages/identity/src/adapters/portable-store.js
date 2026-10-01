import {
  IDENTITY_STORE_SCHEMA_VERSION,
  IdentitySchemaError,
} from '../contracts/identity-store.js';
import { DEFAULT_COMPANY_ID, DEFAULT_COMPANY_SLUG, normalizeCompanyRow } from '../contracts/company.js';
import { SESSION_POLICY, SESSION_TYPES, NATIVE_HANDOFF_TTL_SECONDS, shouldRenewDesktopSession } from '../core/session-policy.js';
import {
  newAccountIdentityId,
  newAuthEventId,
  newAuthUserId,
  newSessionId,
  nowUnix,
} from './cloudflare-d1/ids.js';

async function hashValue(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  const bytes = new TextEncoder().encode(v);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function requirePortableSchema(db) {
  let row;
  try {
    row = await db.prepare(
      `SELECT value FROM identity_schema_meta WHERE key = 'schema_version' LIMIT 1`,
    ).bind().first();
  } catch (err) {
    throw new IdentitySchemaError(
      'IDENTITY_SCHEMA_MIGRATION_REQUIRED',
      'agentsam.identity portable migrations not applied — run applyPortableIdentityMigrations()',
      { cause: String(err?.message || err) },
    );
  }
  const version = Number(row?.value || 0);
  if (version < IDENTITY_STORE_SCHEMA_VERSION) {
    throw new IdentitySchemaError(
      'IDENTITY_SCHEMA_MIGRATION_REQUIRED',
      `identity schema_version=${version}, required=${IDENTITY_STORE_SCHEMA_VERSION}`,
      { version, required: IDENTITY_STORE_SCHEMA_VERSION },
    );
  }
}

/**
 * Shared IdentityStore over portable identity_* tables (SQLite + portable D1).
 * @param {{ prepare: Function }} db
 * @param {{ backend: string, sessionTtlSeconds?: number, skipSchemaCheck?: boolean }} options
 */
export function createPortableIdentityStore(db, options = {}) {
  if (!db?.prepare) throw new Error('portable_identity_store_requires_db');
  const backend = options.backend || 'portable';
  const sessionTtlSeconds = options.sessionTtlSeconds ?? SESSION_POLICY.browser.ttlSeconds;
  let schemaReady = Boolean(options.skipSchemaCheck);

  async function ensure() {
    if (schemaReady) return;
    await requirePortableSchema(db);
    schemaReady = true;
  }

  return Object.freeze({
    schemaVersion: IDENTITY_STORE_SCHEMA_VERSION,
    sessionTtlSeconds,
    backend,

    async findUserByEmail(email) {
      await ensure();
      const row = await db.prepare(
        `SELECT id, email, display_name, password_hash, salt, status, created_at, updated_at
         FROM identity_users WHERE email = ? COLLATE NOCASE LIMIT 1`,
      ).bind(String(email || '').trim().toLowerCase()).first();
      return row || null;
    },

    async findUserById(userId) {
      await ensure();
      const row = await db.prepare(
        `SELECT id, email, display_name, password_hash, salt, status, created_at, updated_at
         FROM identity_users WHERE id = ? LIMIT 1`,
      ).bind(userId).first();
      return row || null;
    },

    async createUser({ email, passwordHash, salt, displayName }) {
      await ensure();
      const id = newAuthUserId();
      const ts = nowUnix();
      const normalizedEmail = String(email || '').trim().toLowerCase();
      await db.prepare(
        `INSERT INTO identity_users (id, email, display_name, password_hash, salt, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      ).bind(id, normalizedEmail, displayName || null, passwordHash || null, salt || null, ts, ts).run();
      return this.findUserById(id);
    },

    async updateUserPassword(userId, passwordHash, salt) {
      await ensure();
      const ts = nowUnix();
      await db.prepare(
        `UPDATE identity_users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?`,
      ).bind(passwordHash, salt, ts, userId).run();
    },

    async findUserByProvider(provider, providerSubject) {
      await ensure();
      const row = await db.prepare(
        `SELECT u.id, u.email, u.display_name, u.password_hash, u.salt, u.status, u.created_at, u.updated_at
         FROM identity_external_accounts ea
         JOIN identity_users u ON u.id = ea.user_id
         WHERE ea.provider = ? AND ea.provider_subject = ?
         LIMIT 1`,
      ).bind(provider, providerSubject).first();
      return row || null;
    },

    async upsertProviderIdentity({ accountId, provider, providerSubject, email }) {
      await ensure();
      const existing = await db.prepare(
        `SELECT id FROM identity_external_accounts WHERE provider = ? AND provider_subject = ? LIMIT 1`,
      ).bind(provider, providerSubject).first();
      const ts = nowUnix();
      if (existing?.id) {
        await db.prepare(
          `UPDATE identity_external_accounts SET user_id = ?, email = ?, updated_at = ? WHERE id = ?`,
        ).bind(accountId, email || null, ts, existing.id).run();
        return existing.id;
      }
      const id = newAccountIdentityId();
      await db.prepare(
        `INSERT INTO identity_external_accounts (id, user_id, provider, provider_subject, email, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, accountId, provider, providerSubject, email || null, ts, ts).run();
      return id;
    },

    async createSession({ userId, email, provider, providerSubject, displayName, type }) {
      await ensure();
      const id = newSessionId();
      const ts = nowUnix();
      const desktop = type === SESSION_TYPES.DESKTOP;
      const expiresAt = ts + (desktop ? SESSION_POLICY.desktop.ttlSeconds : sessionTtlSeconds);
      const sessionType = desktop ? SESSION_TYPES.DESKTOP : SESSION_TYPES.BROWSER;
      await db.prepare(
        `INSERT INTO identity_sessions
         (id, user_id, email, provider, provider_subject, display_name, expires_at, created_at, last_active_at, type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id, userId, email || null, provider || 'email', providerSubject || null,
        displayName || null, expiresAt, ts, ts, sessionType,
      ).run();
      return {
        id,
        type: sessionType,
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
      await ensure();
      const row = await db.prepare(
        `SELECT id, user_id, email, provider, provider_subject, display_name, expires_at, revoked_at, created_at, last_active_at, type
         FROM identity_sessions WHERE id = ? LIMIT 1`,
      ).bind(sessionId).first();
      const now = nowUnix();
      if (!row || row.revoked_at || row.expires_at <= now) return null;
      if (shouldRenewDesktopSession(row, now)) {
        const renewedExpiresAt = now + SESSION_POLICY.desktop.ttlSeconds;
        await db.prepare(
          `UPDATE identity_sessions
           SET expires_at = ?, last_active_at = ?
           WHERE id = ? AND revoked_at IS NULL AND expires_at > ?`,
        ).bind(renewedExpiresAt, now, sessionId, now).run();
        row.expires_at = renewedExpiresAt;
        row.last_active_at = now;
      }
      return row;
    },

    async revokeSession(sessionId, reason = 'logout') {
      await ensure();
      const ts = nowUnix();
      await db.prepare(
        `UPDATE identity_sessions SET revoked_at = ?, last_active_at = ? WHERE id = ? AND revoked_at IS NULL`,
      ).bind(ts, ts, sessionId).run();
      return { ok: true, reason };
    },

    async createOAuthTransaction({
      state, provider, codeVerifier, returnTo, redirectTo, appId, ttlSeconds = 600,
      clientType, nativeChallenge, nativeRedirect,
    }) {
      await ensure();
      if (!appId) {
        throw new IdentitySchemaError(
          'OAUTH_TRANSACTION_APP_ID_REQUIRED',
          'OAuth transactions must include app_id — refusing to create orphan auth state',
        );
      }
      const ts = nowUnix();
      const columns = ['state', 'provider', 'code_verifier', 'return_to', 'app_id', 'expires_at', 'created_at', 'consumed_at'];
      const values = [state, provider, codeVerifier, returnTo ?? redirectTo ?? null, appId, ts + ttlSeconds, ts, null];
      if (clientType === SESSION_TYPES.DESKTOP) {
        columns.push('client_type', 'native_challenge', 'native_redirect');
        values.push(clientType, nativeChallenge ?? null, nativeRedirect ?? null);
      }
      await db.prepare(
        `INSERT INTO identity_oauth_transactions (${columns.join(', ')})
         VALUES (${columns.map(() => '?').join(', ')})`,
      ).bind(...values).run();
    },

    /** @deprecated Use createOAuthTransaction */
    async saveOAuthState(input) {
      return this.createOAuthTransaction({
        ...input,
        returnTo: input.redirectTo ?? input.returnTo,
        appId: input.appId,
      });
    },

    async consumeOAuthTransaction(state) {
      await ensure();
      const row = await db.prepare(
        `SELECT state, provider, code_verifier, return_to, app_id, expires_at, created_at, consumed_at,
                client_type, native_challenge, native_redirect
         FROM identity_oauth_transactions WHERE state = ? LIMIT 1`,
      ).bind(state).first();
      if (!row) return null;
      const ts = nowUnix();
      await db.prepare(
        `UPDATE identity_oauth_transactions SET consumed_at = ? WHERE state = ?`,
      ).bind(ts, state).run();
      await db.prepare(`DELETE FROM identity_oauth_transactions WHERE state = ?`).bind(state).run();
      if (row.consumed_at) return null;
      if (row.expires_at <= ts) return null;
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
        redirect_to: row.return_to,
        return_to: row.return_to,
        app_id: row.app_id,
        client_type: row.client_type ?? null,
        native_challenge: row.native_challenge ?? null,
        native_redirect: row.native_redirect ?? null,
        expires_at: row.expires_at,
        created_at: row.created_at,
        consumed_at: ts,
      };
    },

    /** @deprecated Use consumeOAuthTransaction */
    async consumeOAuthState(state) {
      return this.consumeOAuthTransaction(state);
    },

    async logAuthEvent({
      userId, accountId, eventType, status = 'ok', provider,
      session, capabilities, activity, client, metadata, request,
    }) {
      try {
        await ensure();
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
          `INSERT INTO identity_auth_events
           (id, user_id, event_type, status, provider, metadata_json, ip_hash, user_agent_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          newAuthEventId(), userId || null, eventType, status, provider || null,
          JSON.stringify(envelope), ipHash, uaHash, nowUnix(),
        ).run();
      } catch {
        /* never break auth on audit failure */
      }
    },

    async countAuthActivity(userId) {
      await ensure();
      if (!userId) return { loginCount: 0, activeSessionCount: 0, lastLoginAt: null };
      const logins = await db.prepare(
        `SELECT COUNT(*) AS c, MAX(created_at) AS last_at
         FROM identity_auth_events
         WHERE user_id = ? AND event_type = 'login' AND status = 'ok'`,
      ).bind(userId).first();
      const sessions = await db.prepare(
        `SELECT COUNT(*) AS c FROM identity_sessions
         WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?`,
      ).bind(userId, nowUnix()).first();
      return {
        loginCount: Number(logins?.c || 0),
        activeSessionCount: Number(sessions?.c || 0),
        lastLoginAt: logins?.last_at != null ? Number(logins.last_at) : null,
      };
    },

    async createNativeHandoff({ handoffHash, sessionId, challenge, ttlSeconds = NATIVE_HANDOFF_TTL_SECONDS }) {
      await ensure();
      const ts = nowUnix();
      await db.prepare(
        `INSERT INTO identity_native_handoffs (handoff_hash, session_id, challenge, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(handoffHash, sessionId, challenge, ts + ttlSeconds, ts).run();
    },

    async consumeNativeHandoff(handoffHash) {
      await ensure();
      const ts = nowUnix();
      const row = await db.prepare(
        `UPDATE identity_native_handoffs SET consumed_at = ?
         WHERE handoff_hash = ? AND consumed_at IS NULL AND expires_at > ?
         RETURNING session_id, challenge`,
      ).bind(ts, handoffHash, ts).first();
      return row || null;
    },

    async getCompanyBySlug(slug = DEFAULT_COMPANY_SLUG) {
      await ensure();
      const row = await db.prepare(
        `SELECT id, slug, name, legal_name, logo_url, favicon_url, primary_color, auth_bg_color,
                support_email, website_url, tagline, meta_json, created_at, updated_at
         FROM identity_companies WHERE slug = ? LIMIT 1`,
      ).bind(slug).first();
      return normalizeCompanyRow(row);
    },

    async getCompanyByHost(hostname) {
      await ensure();
      const host = String(hostname || '').trim().toLowerCase().split(':')[0];
      if (!host) return null;
      const { results } = await db.prepare(
        `SELECT id, slug, name, legal_name, logo_url, favicon_url, primary_color, auth_bg_color,
                support_email, website_url, tagline, meta_json, created_at, updated_at
         FROM identity_companies`,
      ).all();
      for (const row of results || []) {
        const company = normalizeCompanyRow(row);
        if (!company) continue;
        const hosts = Array.isArray(company.meta?.hosts)
          ? company.meta.hosts.map((h) => String(h || '').trim().toLowerCase()).filter(Boolean)
          : [];
        if (hosts.includes(host)) return company;
        try {
          if (company.websiteUrl) {
            const siteHost = new URL(company.websiteUrl).hostname.toLowerCase();
            if (siteHost && siteHost === host) return company;
          }
        } catch {
          /* ignore invalid website_url */
        }
      }
      return null;
    },

    async getDefaultCompany() {
      const bySlug = await this.getCompanyBySlug(DEFAULT_COMPANY_SLUG);
      if (bySlug) return bySlug;
      await ensure();
      const row = await db.prepare(
        `SELECT id, slug, name, legal_name, logo_url, favicon_url, primary_color, auth_bg_color,
                support_email, website_url, tagline, meta_json, created_at, updated_at
         FROM identity_companies WHERE id = ? LIMIT 1`,
      ).bind(DEFAULT_COMPANY_ID).first();
      return normalizeCompanyRow(row);
    },

    async upsertCompany(input) {
      await ensure();
      const ts = nowUnix();
      const id = input.id || DEFAULT_COMPANY_ID;
      const slug = input.slug || DEFAULT_COMPANY_SLUG;
      const existing = await db.prepare(`SELECT id FROM identity_companies WHERE id = ? OR slug = ? LIMIT 1`)
        .bind(id, slug).first();
      const metaJson = input.meta ? JSON.stringify(input.meta) : (input.metaJson ?? null);
      if (existing?.id) {
        await db.prepare(
          `UPDATE identity_companies SET
            slug = ?, name = ?, legal_name = ?, logo_url = ?, favicon_url = ?,
            primary_color = ?, auth_bg_color = ?, support_email = ?, website_url = ?,
            tagline = ?, meta_json = ?, updated_at = ?
           WHERE id = ?`,
        ).bind(
          slug, input.name, input.legalName ?? null, input.logoUrl ?? null, input.faviconUrl ?? null,
          input.primaryColor ?? null, input.authBgColor ?? null, input.supportEmail ?? null,
          input.websiteUrl ?? null, input.tagline ?? null, metaJson, ts, existing.id,
        ).run();
        return this.getCompanyBySlug(slug);
      }
      await db.prepare(
        `INSERT INTO identity_companies
         (id, slug, name, legal_name, logo_url, favicon_url, primary_color, auth_bg_color,
          support_email, website_url, tagline, meta_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id, slug, input.name, input.legalName ?? null, input.logoUrl ?? null, input.faviconUrl ?? null,
        input.primaryColor ?? null, input.authBgColor ?? null, input.supportEmail ?? null,
        input.websiteUrl ?? null, input.tagline ?? null, metaJson, ts, ts,
      ).run();
      return this.getCompanyBySlug(slug);
    },

    async upsertProviderConnection({
      userId, provider, credentialRef, grantedScopes = [], expiresAt = null, refreshable = false,
    }) {
      await ensure();
      if (!credentialRef) {
        throw new IdentitySchemaError(
          'PROVIDER_CREDENTIAL_REF_REQUIRED',
          'Provider connections store credential_ref only — never raw secrets',
        );
      }
      const existing = await db.prepare(
        `SELECT id FROM identity_provider_connections WHERE user_id = ? AND provider = ? LIMIT 1`,
      ).bind(userId, provider).first();
      const ts = nowUnix();
      const scopesJson = JSON.stringify(Array.isArray(grantedScopes) ? grantedScopes : []);
      if (existing?.id) {
        await db.prepare(
          `UPDATE identity_provider_connections
           SET granted_scopes_json = ?, credential_ref = ?, expires_at = ?, refreshable = ?, updated_at = ?
           WHERE id = ?`,
        ).bind(scopesJson, credentialRef, expiresAt, refreshable ? 1 : 0, ts, existing.id).run();
        return existing.id;
      }
      const id = `ipc_${crypto.randomUUID().replace(/-/g, '')}`;
      await db.prepare(
        `INSERT INTO identity_provider_connections
         (id, user_id, provider, granted_scopes_json, credential_ref, expires_at, refreshable, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, userId, provider, scopesJson, credentialRef, expiresAt, refreshable ? 1 : 0, ts, ts).run();
      return id;
    },

    async getProviderConnection(userId, provider) {
      await ensure();
      const row = await db.prepare(
        `SELECT id, user_id, provider, granted_scopes_json, credential_ref, expires_at, refreshable, created_at, updated_at
         FROM identity_provider_connections WHERE user_id = ? AND provider = ? LIMIT 1`,
      ).bind(userId, provider).first();
      if (!row) return null;
      let grantedScopes = [];
      try { grantedScopes = JSON.parse(row.granted_scopes_json || '[]'); } catch { grantedScopes = []; }
      return {
        id: row.id,
        user_id: row.user_id,
        provider: row.provider,
        granted_scopes: grantedScopes,
        credential_ref: row.credential_ref,
        expires_at: row.expires_at,
        refreshable: Boolean(row.refreshable),
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    },
  });
}
