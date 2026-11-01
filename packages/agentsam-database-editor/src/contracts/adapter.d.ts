/**
 * Formally exported DatabaseAdapter contract.
 * Adapters must only advertise capabilities they actually implement.
 */

export type DatabaseEngine = "sqlite" | "postgres" | "mysql";

export type DatabaseProvider =
  | "local"
  | "cloudflare-d1"
  | "cloudflare-d1-binding"
  | "supabase"
  | "supabase-postgres"
  | "postgres"
  | "hyperdrive-postgres"
  | "mysql"
  | string;

export type MigrationApplyMode = "statement" | "batch" | "none";

export type DatabaseCapabilities = {
  schemaIntrospection: boolean;
  sqlQuery: boolean;
  rowMutations: boolean;
  export: boolean;
  transactions: boolean;
  multiStatement: boolean;
  migrationApply: MigrationApplyMode;
  /** Structured schema mutations (create/alter/drop) via applyDdl / query. */
  ddl?: boolean;
};

export type TableInfo = {
  name: string;
  schema?: string;
  kind?: string;
  approxRowCount?: number;
};

export type ColumnInfo = {
  name: string;
  type: string;
  nullable?: boolean;
  primaryKey?: boolean;
  defaultValue?: string;
};

export type TableSchema = {
  name: string;
  schema?: string;
  columns: ColumnInfo[];
  indexes?: Array<{ name: string; columns: string[]; unique?: boolean; sql?: string | null }>;
  foreignKeys?: Array<{
    name: string;
    columns: string[];
    refTable: string;
    refColumns: string[];
    refSchema?: string;
  }>;
  createSql?: string | null;
};

export type DatabaseSchema = {
  connectionId: string;
  engine: DatabaseEngine;
  tables: TableInfo[];
};

export type DatabaseQuery = {
  sql: string;
  params?: unknown[];
  limit?: number;
  offset?: number;
  readOnly?: boolean;
};

export type QueryResult = {
  columns: string[];
  rows: unknown[][];
  objects?: Record<string, unknown>[];
  rowCount?: number;
  durationMs?: number;
  truncated?: boolean;
  changes?: number;
  lastInsertId?: unknown;
  rowsRead?: number;
  rowsWritten?: number;
  meta?: Record<string, unknown>;
};

export type InsertRequest = {
  table: string;
  schema?: string;
  values: Record<string, unknown>;
};

export type UpdateRequest = {
  table: string;
  schema?: string;
  values: Record<string, unknown>;
  where: Record<string, unknown>;
};

export type DeleteRequest = {
  table: string;
  schema?: string;
  where: Record<string, unknown>;
};

export type MutationResult = {
  changes: number;
  lastInsertId?: unknown;
  row?: unknown;
  rows?: unknown[];
};

export type DatabaseHealth = {
  status: "ok" | "degraded" | "down";
  detail?: string;
  latencyMs?: number;
  metrics?: Record<string, unknown>;
};

export type MigrationApplyResult = {
  ok: boolean;
  results: Array<{ sql: string; ok: boolean; error?: string }>;
};

export type DatabaseAdapter = {
  id: string;
  dialect: DatabaseEngine;
  label?: string;
  provider?: DatabaseProvider;
  capabilities: () => DatabaseCapabilities;
  introspect: () => Promise<DatabaseSchema>;
  listTables: () => Promise<TableInfo[]>;
  describeTable: (name: string | { name: string; schema?: string }, opts?: { schema?: string }) => Promise<TableSchema>;
  query: (input: DatabaseQuery) => Promise<QueryResult>;
  insert?: (input: InsertRequest) => Promise<MutationResult>;
  update?: (input: UpdateRequest) => Promise<MutationResult>;
  delete?: (input: DeleteRequest) => Promise<MutationResult>;
  health?: () => Promise<DatabaseHealth>;
  applyMigration?: (sql: string) => Promise<MigrationApplyResult>;
  /** Run fn inside a provider transaction when supported. */
  transaction?: <T>(fn: (adapter: DatabaseAdapter) => Promise<T>) => Promise<T>;
  /** Dump schema+data export when supported. */
  export?: (opts?: { format?: "sql" | "json"; tables?: string[] }) => Promise<{ format: string; payload: string }>;
  close?: () => void;
};
