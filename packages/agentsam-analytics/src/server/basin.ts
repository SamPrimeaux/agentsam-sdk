/**
 * Basin SQL is read-only. This module constructs fixed, tenant-scoped queries;
 * the Cloudflare connector supplies an executor using the CALLER'S grant.
 * No platform API token, account fallback or arbitrary browser SQL is accepted.
 */
export type BasinQueryExecutor = (sql: string) => Promise<unknown>;
export interface ScopedBasinActivityOptions {
  accountId: string;
  namespace: string;
  table: string;
  sinceUnixMs: number;
  execute: BasinQueryExecutor;
}
function assertInternalAccountId(accountId: string): void {
  if (typeof accountId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(accountId)) {
    throw new TypeError("authenticated_account_required");
  }
}
function sqlIdentifier(value: string): string {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new TypeError("invalid_basin_table_identifier");
  }
  return value;
}
/**
 * Execute a fixed read model, not user-submitted SQL. Caller-authenticated
 * Cloudflare credentials and catalog selection are resolved outside this module
 * by the connector, never inferred from a global Workers environment variable.
 */
export async function queryScopedBasinActivity(options: ScopedBasinActivityOptions): Promise<unknown> {
  assertInternalAccountId(options?.accountId);
  const qualified = sqlIdentifier(options.namespace) + "." + sqlIdentifier(options.table);
  const since = options.sinceUnixMs;
  if (!Number.isSafeInteger(since) || since < 0) {
    throw new TypeError("invalid_analytics_range");
  }
  if (typeof options.execute !== "function") {
    throw new TypeError("basin_account_credential_required");
  }
  const sql = `SELECT domain, operation, outcome,
    COUNT(*) AS events, MAX(occurred_at) AS last_seen
    FROM ${qualified}
    WHERE account_id = '${options.accountId}' AND occurred_at >= ${since}
    GROUP BY domain, operation, outcome
    LIMIT 200`;
  return options.execute(sql);
}
