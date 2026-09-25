import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IDENTITY_STORE_SCHEMA_VERSION,
  IdentitySchemaError,
} from '../../contracts/identity-store.js';
import { newAccountIdentityId, newAuthEventId, newAuthUserId, newSessionId, nowUnix } from '../cloudflare-d1/ids.js';
import { SESSION_POLICY } from '../../core/constants.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SQLITE_MIGRATIONS_DIR = path.resolve(HERE, '../../../migrations/sqlite');

/**
 * Apply identity.core + identity.oauth-client (+ optional oauth-server) to a
 * D1-shaped db ({ prepare().bind().run|first|all }).
 *
 * @param {{ prepare: Function }} db
 * @param {{ includeOAuthServer?: boolean }} [opts]
 */
export async function applySqliteIdentityMigrations(db, opts = {}) {
  const files = [
    '001_identity_core.sql',
    '002_identity_oauth_client.sql',
  ];
  if (opts.includeOAuthServer) files.push('003_identity_oauth_server.sql');

  for (const file of files) {
    const sql = fs.readFileSync(path.join(SQLITE_MIGRATIONS_DIR, file), 'utf8');
    if (typeof db.exec === 'function') {
      db.exec(sql);
      continue;
    }
    // D1-shaped: run statement-by-statement (no multi-exec).
    const stripped = sql.replace(/\/\*[\s\S]*?\*\//g, '');
    const statements = stripped
      .split(';')
      .map((s) => s.replace(/--[^\n]*/g, '').trim())
      .filter(Boolean);
    for (const statement of statements) {
      await db.prepare(statement).run();
    }
  }
}

async function hashValue(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  const bytes = new TextEncoder().encode(v);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function requireSchema(db) {
  let row;
  try {
    row = await db.prepare(
      `SELECT value FROM identity_schema_meta WHERE key = 'schema_version' LIMIT 1`,
    ).bind().first();
  } catch (err) {
    throw new IdentitySchemaError(
      'IDENTITY_SCHEMA_MIGRATION_REQUIRED',
      'identity.core migrations not applied — run applySqliteIdentityMigrations()',
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
 * Local SQLite IdentityStore — full offline identity, no Cloudflare/IAM.
 * @param {{ prepare: Function }} db D1-shaped binding (see createLocalSqliteDatabase)
 * @param {{ sessionTtlSeconds?: number, skipSchemaCheck?: boolean }} [options]
 */
export function createSqliteIdentityAdapter(db, options = {}) {
  if (!db?.prepare) throw new Error('sqlite_identity_adapter_requires_db');
  const sessionTtlSeconds = options.sessionTtlSeconds ?? SESSION_POLICY.browser.ttlSeconds;
  let schemaReady = Boolean(options.skipSchemaCheck);

  async function ensure() {
    if (schemaReady) return;
    await requireSchema(db);
    schemaReady = true;
  }

  return Object.freeze({
    schemaVersion: IDENTITY_STORE_SCHEMA_VERSION,
    sessionTtlSeconds,
    backend: 'sqlite',

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

    async createSession({ userId, email, provider, providerSubject, displayName }) {
      await ensure();
      const id = newSessionId();
      const ts = nowUnix();
      const expiresAt = ts + sessionTtlSeconds;
      await db.prepare(
        `INSERT INTO identity_sessions
         (id, user_id, email, provider, provider_subject, display_name, expires_at, created_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id, userId, email || null, provider || 'email', providerSubject || null,
        displayName || null, expiresAt, ts, ts,
      ).run();
      return {
        id, user_id: userId, email, provider: provider || 'email',
        provider_subject: providerSubject || null, display_name: displayName || null,
        expires_at: expiresAt, created_at: ts,
      };
    },

    async getSession(sessionId) {
      await ensure();
      const row = await db.prepare(
        `SELECT id, user_id, email, provider, provider_subject, display_name, expires_at, revoked_at, created_at, last_active_at
         FROM identity_sessions WHERE id = ? LIMIT 1`,
      ).bind(sessionId).first();
      if (!row || row.revoked_at || row.expires_at <= nowUnix()) return null;
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

    async createOAuthTransaction({ state, provider, codeVerifier, returnTo, appId, ttlSeconds = 600 }) {
      await ensure();
      if (!appId) {
        throw new IdentitySchemaError(
          'OAUTH_TRANSACTION_APP_ID_REQUIRED',
          'OAuth transactions must include app_id — refusing to create orphan auth state',
        );
      }
      const ts = nowUnix();
      await db.prepare(
        `INSERT INTO identity_oauth_transactions
         (state, provider, code_verifier, return_to, app_id, expires_at, created_at, consumed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      ).bind(state, provider, codeVerifier, returnTo || null, appId, ts + ttlSeconds, ts).run();
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
        `SELECT state, provider, code_verifier, return_to, app_id, expires_at, created_at, consumed_at
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
  });
}
