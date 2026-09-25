/**
 * Connection registry — engine ≠ provider ≠ accelerator ≠ vector driver.
 *
 * Secrets never live in connection records — only credential_ref / binding refs.
 *
 * @typedef {object} HyperdriveAccelerator
 * @property {'hyperdrive'} driver
 * @property {string} configurationId
 * @property {string} [localConnectionStringRef]  env/secret name for local bypass
 *
 * @typedef {object} VectorConfig
 * @property {'none'|'sqlite_exact'|'sqlite_vector'|'pgvector'|'vectorize'} driver
 * @property {string} [profileId]  embedding profile id when semantic
 * @property {string} [indexName]  Vectorize index / pg table
 * @property {string} [namespace]
 *
 * @typedef {object} SqliteConnection
 * @property {string} path  e.g. .agentsam/agentsam.sqlite
 *
 * @typedef {object} D1Connection
 * @property {string} databaseId
 * @property {string} [accountRef]
 * @property {string} [binding]  Worker binding name, never a token
 *
 * @typedef {object} PostgresConnection
 * @property {string} [credential_ref]  vault://...
 * @property {string} [connectionStringRef]  env name
 * @property {string} [host]
 * @property {number} [port]
 * @property {string} [database]
 *
 * @typedef {object} DatabaseConnection
 * @property {'agentsam.database-connection.v1'} [schema]
 * @property {string} id
 * @property {'sqlite'|'postgres'|'mysql'} engine
 * @property {'local'|'cloudflare-d1'|'supabase'|'postgres'|'mysql'} provider
 * @property {SqliteConnection|D1Connection|PostgresConnection} connection
 * @property {HyperdriveAccelerator} [accelerator]
 * @property {VectorConfig} [vectors]
 * @property {string} [account_id]  optional hosted owner — never workspace_id
 * @property {string} [label]
 * @property {string} [created_at]
 */

/**
 * First-class healthy config: local SQLite with vectors explicitly none.
 * Vector support is never mandatory.
 *
 * @param {{ path: string, id?: string, label?: string }} opts
 * @returns {DatabaseConnection}
 */
export function createLocalSqliteConnection(opts) {
  const filePath = String(opts?.path || '').trim();
  if (!filePath) throw new Error('sqlite_path_required');
  const id = opts.id || `sqlite:local:${filePath}`;
  return {
    schema: 'agentsam.database-connection.v1',
    id,
    label: opts.label || 'Local SQLite',
    engine: 'sqlite',
    provider: 'local',
    connection: { path: filePath },
    vectors: { driver: 'none' },
    created_at: new Date().toISOString(),
  };
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isVectorsNone(raw) {
  if (raw == null) return true;
  if (typeof raw !== 'object') return false;
  const driver = /** @type {{ driver?: string }} */ (raw).driver;
  return driver == null || driver === 'none';
}
