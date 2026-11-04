/**
 * Worker/server backend entry — no Node-only sqlite.
 * Hosts that need local SQLite import `./backend/sqlite` separately.
 */

export {
  createD1Adapter,
  createD1BindingAdapter,
} from "../src/adapters/d1.js";
export {
  createPostgresAdapter,
  createHyperdriveAdapter,
} from "../src/adapters/postgres.js";
export { createSupabaseAdapter } from "../src/adapters/supabase.js";
export { readD1Metrics, readD1AccountMetrics } from "../src/metrics/d1.js";
export { listD1Resources, manageD1Resource } from "../src/runtime/d1-management.js";
export { readPostgresMetrics } from "../src/metrics/postgres.js";

export {
  createLocalSqliteConnection,
  isVectorsNone,
  DATABASE_CAPABILITY_KEYS,
  DATABASE_ENGINES,
  DATABASE_PROVIDERS,
} from "../src/contracts/index.js";

export {
  deriveCapabilities,
  withHonestCapabilities,
  toStudioCapabilities,
  sqlKind,
  assertSqlAllowed,
  readTableRows,
  DDL_ACTIONS,
  buildDdlSql,
  applyDdl,
  buildCreateTableSql,
  assertSafeIdent,
  registerAdapterFactory,
  listRegisteredAdapterKinds,
  createAdapter,
  createAdapterFromConnection,
  createDatabaseRequestHandler,
} from "../src/runtime/index.js";
