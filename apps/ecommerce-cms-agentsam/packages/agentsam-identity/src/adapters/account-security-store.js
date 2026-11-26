/**
 * Account self-service store (profile, sessions, backup codes, company authority)
 * shared by every IdentityStore adapter. Adapters differ only in table mapping:
 *
 *   iam-compat → auth_users (+ accounts mirror), auth_sessions, user_backup_codes
 *   portable   → identity_users + identity_user_profiles, identity_sessions,
 *                identity_backup_codes (migrations/sqlite/006_identity_account_security.sql)
 *
 * Every query is scoped by the authenticated user id passed in by the router;
 * nothing here accepts a user id from request input.
 */
import { AccountCapabilityError, toUnixSeconds } from '../core/account-security.js';
import { hasColumn } from './column-support.js';

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function isMissingSchema(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('no such table') || msg.includes('no such column') || msg.includes('has no column');
}

async function guard(fn) {
  try {
    return await fn();
  } catch (err) {
    if (isMissingSchema(err)) {
      throw new AccountCapabilityError(
        'account_security_migration_required',
        `Account security schema is not installed: ${String(err?.message || err).slice(0, 160)}`,
      );
    }
    throw err;
  }
}

const PROFILE_COLUMNS = Object.freeze({
  displayName: 'display_name',
  avatarUrl: 'avatar_url',
  timezone: 'timezone',
  notificationEmail: 'notification_email',
});

/**
 * @param {{ prepare: Function, batch?: Function }} db
 * @param {{
 *   layout: 'iam-compat' | 'portable',
 *   canManageCompany: (userId: string) => Promise<boolean>,
 * }} config
 */
export function createAccountSecurityStore(db, config) {
  const iam = config.layout === 'iam-compat';
  const T = iam
    ? { users: 'auth_users', sessions: 'auth_sessions', codes: 'user_backup_codes' }
    : { users: 'identity_users', sessions: 'identity_sessions', codes: 'identity_backup_codes' };

  async function runAll(statements) {
    if (typeof db.batch === 'function') return db.batch(statements);
    const out = [];
    for (const stmt of statements) out.push(await stmt.run());
    return out;
  }

  return Object.freeze({
    accountSecurity: true,

    async getAccountProfile(userId) {
      return guard(async () => {
        const row = iam
          ? await db.prepare(
            `SELECT id, email, display_name, avatar_url, timezone, notification_email, created_at
             FROM auth_users WHERE id = ? LIMIT 1`,
          ).bind(userId).first()
          : await db.prepare(
            `SELECT u.id, u.email, u.display_name, p.avatar_url, p.timezone, p.notification_email, u.created_at
             FROM identity_users u LEFT JOIN identity_user_profiles p ON p.user_id = u.id
             WHERE u.id = ? LIMIT 1`,
          ).bind(userId).first();
        if (!row) return null;
        return {
          id: String(row.id),
          email: String(row.email),
          displayName: row.display_name ?? null,
          avatarUrl: row.avatar_url ?? null,
          timezone: row.timezone ?? null,
          notificationEmail: row.notification_email ?? null,
          createdAt: toUnixSeconds(row.created_at),
        };
      });
    },

    /** @param {string} userId @param {Record<string, string|null>} patch validated by validateProfilePatch */
    async updateAccountProfile(userId, patch) {
      return guard(async () => {
        const entries = Object.entries(patch).filter(([key]) => key in PROFILE_COLUMNS);
        if (!entries.length) return this.getAccountProfile(userId);
        const ts = nowUnix();
        const statements = [];
        if (iam) {
          const sets = entries.map(([key]) => `${PROFILE_COLUMNS[key]} = ?`);
          const values = entries.map(([, value]) => value);
          // auth_users is the login principal; accounts is the account row of record.
          // Both carry the same profile columns on the hosted schema.
          statements.push(db.prepare(
            `UPDATE auth_users SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`,
          ).bind(...values, ts, userId));
          statements.push(db.prepare(
            `UPDATE accounts SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`,
          ).bind(...values, ts, userId));
        } else {
          const name = entries.find(([key]) => key === 'displayName');
          if (name) {
            statements.push(db.prepare(
              `UPDATE identity_users SET display_name = ?, updated_at = ? WHERE id = ?`,
            ).bind(name[1], ts, userId));
            // Keep the account row of record in step when migration 008 is applied.
            if (name[1] && await hasColumn(db, 'accounts', 'display_name')) {
              statements.push(db.prepare(
                `UPDATE accounts SET display_name = ?, updated_at = ? WHERE id = ?`,
              ).bind(name[1], ts, userId));
            }
          }
          const profileEntries = entries.filter(([key]) => key !== 'displayName');
          if (profileEntries.length) {
            const cols = profileEntries.map(([key]) => PROFILE_COLUMNS[key]);
            statements.push(db.prepare(
              `INSERT INTO identity_user_profiles (user_id, ${cols.join(', ')}, updated_at)
               VALUES (?, ${cols.map(() => '?').join(', ')}, ?)
               ON CONFLICT(user_id) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(', ')},
                 updated_at = excluded.updated_at`,
            ).bind(userId, ...profileEntries.map(([, v]) => v), ts));
          }
        }
        await runAll(statements);
        return this.getAccountProfile(userId);
      });
    },

    async listUserSessions(userId) {
      return guard(async () => {
        const { results } = await db.prepare(
          `SELECT id, type, provider, created_at, last_active_at, expires_at
           FROM ${T.sessions}
           WHERE user_id = ? AND revoked_at IS NULL
           ORDER BY COALESCE(last_active_at, 0) DESC
           LIMIT 100`,
        ).bind(userId).all();
        const now = nowUnix();
        return (results || []).filter((row) => {
          const exp = toUnixSeconds(row.expires_at);
          return exp === null || exp > now;
        });
      });
    },

    async revokeUserSession(userId, sessionId, reason = 'user_revoked') {
      return guard(async () => {
        const ts = nowUnix();
        const res = await db.prepare(
          `UPDATE ${T.sessions} SET revoked_at = ?, last_active_at = ?
           WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
        ).bind(ts, ts, sessionId, userId).run();
        return { ok: Number(res?.meta?.changes ?? res?.changes ?? 0) > 0, reason };
      });
    },

    async revokeOtherUserSessions(userId, keepSessionId) {
      return guard(async () => {
        const ts = nowUnix();
        const res = await db.prepare(
          `UPDATE ${T.sessions} SET revoked_at = ?, last_active_at = ?
           WHERE user_id = ? AND id != ? AND revoked_at IS NULL`,
        ).bind(ts, ts, userId, keepSessionId).run();
        return { ok: true, revoked: Number(res?.meta?.changes ?? res?.changes ?? 0) };
      });
    },

    async getBackupCodeStatus(userId) {
      return guard(async () => {
        const row = await db.prepare(
          `SELECT COUNT(*) AS total,
                  SUM(CASE WHEN used_at IS NULL AND (expires_at IS NULL OR expires_at > ?) THEN 1 ELSE 0 END) AS remaining,
                  MAX(created_at) AS created_at
           FROM ${T.codes} WHERE user_id = ?`,
        ).bind(nowUnix(), userId).first();
        return {
          total: Number(row?.total || 0),
          remaining: Number(row?.remaining || 0),
          generatedAt: toUnixSeconds(row?.created_at),
        };
      });
    },

    /** Replace every code for the user. Callers pass digests only. */
    async replaceBackupCodes(userId, codeHashes) {
      return guard(async () => {
        const ts = nowUnix();
        const statements = [db.prepare(`DELETE FROM ${T.codes} WHERE user_id = ?`).bind(userId)];
        for (const hash of codeHashes) {
          statements.push(db.prepare(
            `INSERT INTO ${T.codes} (id, user_id, code_hash, used_at, created_at) VALUES (?, ?, ?, NULL, ?)`,
          ).bind(newId('ubc'), userId, hash, ts));
        }
        await runAll(statements);
        return this.getBackupCodeStatus(userId);
      });
    },

    /** Atomically consume one unused code matching any candidate digest. */
    async consumeBackupCode(userId, candidateHashes) {
      return guard(async () => {
        if (!candidateHashes.length) return false;
        const ts = nowUnix();
        const row = await db.prepare(
          `SELECT id FROM ${T.codes}
           WHERE user_id = ? AND used_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
             AND code_hash IN (${candidateHashes.map(() => '?').join(', ')})
           LIMIT 1`,
        ).bind(userId, ts, ...candidateHashes).first();
        if (!row?.id) return false;
        const res = await db.prepare(
          `UPDATE ${T.codes} SET used_at = ? WHERE id = ? AND used_at IS NULL`,
        ).bind(ts, row.id).run();
        return Number(res?.meta?.changes ?? res?.changes ?? 0) > 0;
      });
    },

    async canManageCompany(userId) {
      if (!userId) return false;
      try {
        return Boolean(await config.canManageCompany(userId));
      } catch (err) {
        if (isMissingSchema(err)) return false;
        throw err;
      }
    },
  });
}
