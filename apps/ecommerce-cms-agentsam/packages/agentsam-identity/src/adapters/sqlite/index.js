/**
 * Local SQLite IdentityStore — portable identity_* schema, zero Cloudflare/IAM.
 * Shares the portable store implementation because Node SQLite is exposed through
 * the same prepare/bind/first/run shape as D1-shaped bindings.
 */
export {
  applyPortableIdentityMigrations,
  applySqliteIdentityMigrations,
  PORTABLE_IDENTITY_MIGRATIONS_DIR,
  SQLITE_MIGRATIONS_DIR,
  resolveIdentitySchemaPack,
  IDENTITY_SCHEMA_PACK_MANIFEST_PATH,
} from '../../../migrations/apply-portable.js';

import { createPortableIdentityStore } from '../portable-store.js';

/**
 * @param {{ prepare: Function }} db D1-shaped binding (see createLocalSqliteDatabase)
 * @param {{ sessionTtlSeconds?: number, skipSchemaCheck?: boolean }} [options]
 */
export function createSqliteIdentityAdapter(db, options = {}) {
  return createPortableIdentityStore(db, { ...options, backend: 'sqlite' });
}
