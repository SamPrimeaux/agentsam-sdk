import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Package-owned portable SQL SSOT (resolves inside installed npm package). */
export const PORTABLE_IDENTITY_MIGRATIONS_DIR = path.resolve(HERE, 'sqlite');

/** @deprecated Prefer PORTABLE_IDENTITY_MIGRATIONS_DIR */
export const SQLITE_MIGRATIONS_DIR = PORTABLE_IDENTITY_MIGRATIONS_DIR;

export const IDENTITY_SCHEMA_PACK_MANIFEST_PATH = path.resolve(
  HERE,
  '../schema/agentsam.identity/manifest.json',
);

/**
 * Resolve the agentsam.identity pack-family manifest from the installed package.
 * @returns {{ manifest: object, manifestPath: string, sqlDir: string }}
 */
export function resolveIdentitySchemaPack() {
  const manifestPath = IDENTITY_SCHEMA_PACK_MANIFEST_PATH;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return {
    manifest,
    manifestPath,
    sqlDir: PORTABLE_IDENTITY_MIGRATIONS_DIR,
  };
}

function listPortableMigrationFiles(opts = {}) {
  const files = [
    '001_identity_core.sql',
    '002_identity_oauth_client.sql',
    '005_identity_company_native.sql',
  ];
  if (opts.includeOAuthServer) {
    files.push('003_identity_oauth_server.sql');
    files.push('004_identity_oauth_consent_catalog.sql');
  }
  return files;
}

function isIgnorableMigrationError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('duplicate column')
    || msg.includes('already exists')
    || msg.includes('duplicate column name')
  );
}

async function runSql(db, sql) {
  if (typeof db.exec === 'function') {
    try {
      db.exec(sql);
      return;
    } catch (err) {
      // Multi-statement exec may fail mid-file on duplicate ALTER; fall through to statements.
      if (!isIgnorableMigrationError(err) && !/alter table/i.test(sql)) throw err;
    }
  }
  const stripped = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  const statements = stripped
    .split(';')
    .map((s) => s.replace(/--[^\n]*/g, '').trim())
    .filter(Boolean);
  for (const statement of statements) {
    try {
      if (typeof db.exec === 'function' && !db.prepare) {
        db.exec(statement);
      } else {
        await db.prepare(statement).run();
      }
    } catch (err) {
      if (isIgnorableMigrationError(err)) continue;
      throw err;
    }
  }
}

/**
 * Apply portable agentsam.identity SQL pack to a SQLite or D1-shaped target.
 * Same SQL sources for both; executor differs by driver API.
 *
 * @param {{ prepare?: Function, exec?: Function }} target
 * @param {{ includeOAuthServer?: boolean }} [opts]
 */
export async function applyPortableIdentityMigrations(target, opts = {}) {
  if (!target || (typeof target.exec !== 'function' && typeof target.prepare !== 'function')) {
    throw new Error('applyPortableIdentityMigrations_requires_db_target');
  }
  const files = listPortableMigrationFiles(opts);
  for (const file of files) {
    const sqlPath = path.join(PORTABLE_IDENTITY_MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await runSql(target, sql);
  }
}

/**
 * Stable compatibility alias — same portable pack, same sources.
 * @param {{ prepare?: Function, exec?: Function }} db
 * @param {{ includeOAuthServer?: boolean }} [opts]
 */
export async function applySqliteIdentityMigrations(db, opts = {}) {
  return applyPortableIdentityMigrations(db, opts);
}
