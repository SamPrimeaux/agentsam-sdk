/**
 * Public contracts entry — previously empty (`export {}`) while package.json
 * advertised `./contracts`. Export the database connection model + capability
 * vocabulary. Icon vocabulary stays on the package root (optional host UI deps).
 */

export {
  createLocalSqliteConnection,
  isVectorsNone,
} from './connection.js';

export {
  METRICS_ADAPTER_IDS,
  metricsCacheKey,
} from './metrics-adapter.js';

export {
  EMBEDDING_PROVIDER_POLICY,
} from './embeddings-policy.js';

/**
 * Capability vocabulary used by DatabaseAdapter.capabilities().
 * Keep in sync with src/contracts/adapter.js typedefs and runtime/capabilities.js.
 */
export const DATABASE_CAPABILITY_KEYS = Object.freeze([
  'schemaIntrospection',
  'sqlQuery',
  'rowMutations',
  'export',
  'transactions',
  'multiStatement',
  'migrationApply',
  'ddl',
]);

export const DATABASE_ENGINES = Object.freeze(['sqlite', 'postgres', 'mysql']);

export const DATABASE_PROVIDERS = Object.freeze([
  'local',
  'cloudflare-d1',
  'cloudflare-d1-binding',
  'supabase',
  'supabase-postgres',
  'postgres',
  'hyperdrive-postgres',
  'mysql',
]);

/** @typedef {import('./adapter.js').DatabaseAdapter} DatabaseAdapter */
/** @typedef {import('./adapter.js').DatabaseCapabilities} DatabaseCapabilities */
/** @typedef {import('./adapter.js').DatabaseEngine} DatabaseEngine */
/** @typedef {import('./adapter.js').DatabaseProvider} DatabaseProvider */
/** @typedef {import('./adapter.js').TableInfo} TableInfo */
/** @typedef {import('./adapter.js').ColumnInfo} ColumnInfo */
/** @typedef {import('./adapter.js').TableSchema} TableSchema */
/** @typedef {import('./adapter.js').DatabaseSchema} DatabaseSchema */
/** @typedef {import('./adapter.js').DatabaseQuery} DatabaseQuery */
/** @typedef {import('./adapter.js').QueryResult} QueryResult */
/** @typedef {import('./adapter.js').InsertRequest} InsertRequest */
/** @typedef {import('./adapter.js').UpdateRequest} UpdateRequest */
/** @typedef {import('./adapter.js').DeleteRequest} DeleteRequest */
/** @typedef {import('./adapter.js').MutationResult} MutationResult */
/** @typedef {import('./adapter.js').DatabaseHealth} DatabaseHealth */
/** @typedef {import('./connection.js').DatabaseConnection} DatabaseConnection */
