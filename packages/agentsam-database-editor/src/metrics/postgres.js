/**
 * Point-in-time PostgreSQL metrics. Hosts may persist successive snapshots to
 * build historical charts without requiring an extension in the customer DB.
 */
export async function readPostgresMetrics(options = {}) {
  if (typeof options.query !== 'function') throw new Error('postgres_query_function_required');
  const query = options.query;
  const started = Date.now();

  const [dbResult, tablesResult, connectionResult] = await Promise.all([
    query(
      `SELECT current_database() AS database_name,
              pg_database_size(current_database())::bigint AS size_bytes,
              xact_commit::bigint AS commits,
              xact_rollback::bigint AS rollbacks,
              tup_returned::bigint AS tuples_returned,
              tup_fetched::bigint AS tuples_fetched,
              tup_inserted::bigint AS tuples_inserted,
              tup_updated::bigint AS tuples_updated,
              tup_deleted::bigint AS tuples_deleted,
              stats_reset
         FROM pg_stat_database
        WHERE datname = current_database()`,
      [],
    ),
    query(
      `SELECT COUNT(*)::bigint AS table_count
         FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog','information_schema')
          AND table_type = 'BASE TABLE'`,
      [],
    ),
    query(
      `SELECT COUNT(*)::bigint AS connections,
              current_setting('max_connections')::bigint AS max_connections
         FROM pg_stat_activity
        WHERE datname = current_database()`,
      [],
    ),
  ]);

  const db = dbResult?.rows?.[0] || {};
  const table = tablesResult?.rows?.[0] || {};
  const connection = connectionResult?.rows?.[0] || {};
  const readOps =
    Number(db.tuples_returned || 0) +
    Number(db.tuples_fetched || 0);
  const writeOps =
    Number(db.tuples_inserted || 0) +
    Number(db.tuples_updated || 0) +
    Number(db.tuples_deleted || 0);
  const queries =
    Number(db.commits || 0) +
    Number(db.rollbacks || 0);

  return {
    provider: options.provider || 'postgres',
    capturedAt: Math.floor(Date.now() / 1000),
    databaseName: db.database_name || null,
    statsReset: db.stats_reset || null,
    sizeBytes: Number(db.size_bytes || 0),
    tables: Number(table.table_count || 0),
    connections: Number(connection.connections || 0),
    maxConnections: Number(connection.max_connections || 0),
    totals: {
      queries,
      readQueries: null,
      writeQueries: null,
      rowsRead: readOps,
      rowsWritten: writeOps,
      commits: Number(db.commits || 0),
      rollbacks: Number(db.rollbacks || 0),
    },
    latencyMs: Date.now() - started,
    wired: true,
  };
}
