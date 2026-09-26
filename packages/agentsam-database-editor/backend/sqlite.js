// Node-only local runtime entrypoint. Keep node:sqlite out of Worker/browser graphs.
export { createSqliteAdapter } from "../src/adapters/sqlite.js";
export {
  createLocalSqliteConnection,
  isVectorsNone,
} from "../src/contracts/connection.js";
