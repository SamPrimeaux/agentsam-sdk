export {
  deriveCapabilities,
  withHonestCapabilities,
  toStudioCapabilities,
} from './capabilities.js';

export { sqlKind, assertSqlAllowed } from './sql-guard.js';
export { readTableRows } from './rows.js';

export {
  DDL_ACTIONS,
  buildDdlSql,
  applyDdl,
  buildCreateTableSql,
  assertSafeIdent,
} from './ddl.js';

export {
  registerAdapterFactory,
  registerSqliteAdapterFactory,
  listRegisteredAdapterKinds,
  createAdapter,
  createAdapterFromConnection,
} from './registry.js';

export { createDatabaseRequestHandler } from './request-handler.js';
