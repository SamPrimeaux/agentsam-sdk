/**
 * Portable D1 IdentityStore — SAME portable identity_* schema as SQLite.
 * Clean customer D1 (user123). Does NOT query accounts/auth_users/company/etc.
 *
 * Implementation shares prepare/bind CRUD with SQLite only because both targets
 * already speak the same D1-shaped statement API — not because D1 was forced
 * through a Node sqlite emulator.
 */
export {
  applyPortableIdentityMigrations,
  applySqliteIdentityMigrations,
  resolveIdentitySchemaPack,
} from '../../../migrations/apply-portable.js';

import { createPortableIdentityStore } from '../portable-store.js';

/**
 * @param {{ prepare: Function }} db Cloudflare D1 binding or D1-shaped fixture
 * @param {{ sessionTtlSeconds?: number, skipSchemaCheck?: boolean }} [options]
 */
export function createPortableD1IdentityAdapter(db, options = {}) {
  if (!db?.prepare) throw new Error('portable_d1_identity_adapter_requires_db');
  return createPortableIdentityStore(db, { ...options, backend: 'portable-d1' });
}
