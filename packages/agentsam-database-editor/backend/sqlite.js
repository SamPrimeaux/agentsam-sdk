// Node-only local runtime entrypoint. Keep node:sqlite out of Worker/browser graphs.
import { createSqliteAdapter } from "../src/adapters/sqlite.js";
import { registerSqliteAdapterFactory } from "../src/runtime/registry.js";

registerSqliteAdapterFactory(createSqliteAdapter);

export { createSqliteAdapter };
export {
  createLocalSqliteConnection,
  isVectorsNone,
} from "../src/contracts/connection.js";
export {
  withHonestCapabilities,
  deriveCapabilities,
  createAdapter,
  createAdapterFromConnection,
  createDatabaseRequestHandler,
  buildDdlSql,
  applyDdl,
  DDL_ACTIONS,
} from "../src/runtime/index.js";
