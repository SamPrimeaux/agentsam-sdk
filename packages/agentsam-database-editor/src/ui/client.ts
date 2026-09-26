export type DatabaseSource = {
  id: string;
  provider: "cloudflare-d1" | "supabase-postgres" | "postgres" | "local-sqlite" | string;
  engine: "sqlite" | "postgres" | string;
  label: string;
  database_name?: string;
  database_id?: string;
  account_id?: string;
  file_size?: number;
  num_tables?: number;
  writable: boolean;
  metrics: boolean;
  accelerator?: string;
  connection?: string;
  status?: string;
  error?: string;
};

export type DatabaseConnectionStatus = {
  provider?: string;
  status: string;
  connect_url?: string;
  reconnect_url?: string;
  account_id?: string;
  error?: string;
  message?: string;
  latency_ms?: number | null;
};

export type DatabaseSourcesResponse = {
  ok: boolean;
  sources: DatabaseSource[];
  connections?: Record<string, DatabaseConnectionStatus>;
  error?: string;
};

export type DatabaseSeriesPoint = {
  t: string;
  queries?: number | null;
  readQueries?: number | null;
  writeQueries?: number | null;
  rowsRead?: number | null;
  rowsWritten?: number | null;
  sizeBytes?: number | null;
  tables?: number | null;
  connections?: number | null;
  maxConnections?: number | null;
};

export type DatabaseMetricsResponse = {
  ok: boolean;
  source: DatabaseSource;
  range: string;
  kpis: {
    queries?: number | null;
    readQueries?: number | null;
    writeQueries?: number | null;
    rowsRead?: number | null;
    rowsWritten?: number | null;
    tables?: number | null;
    storage?: number | null;
    connections?: number | null;
  };
  capacity?: {
    usedBytes?: number | null;
    limitBytes?: number | null;
    pctUsed?: number | null;
    connectionsUsed?: number | null;
    connectionsMax?: number | null;
  };
  series: DatabaseSeriesPoint[];
  health?: {
    status?: string;
    detail?: string;
    latencyMs?: number | null;
    hyperdrive?: string;
  };
  error?: string;
};

export type DatabaseTableInfo = {
  name: string;
  schema?: string;
  kind?: string;
};

export type DatabaseColumnInfo = {
  name: string;
  type: string;
  nullable?: boolean;
  primaryKey?: boolean;
  defaultValue?: string;
};

export type DatabaseSchemaInfo = {
  name: string;
  schema?: string;
  columns: DatabaseColumnInfo[];
  indexes?: Array<{ name: string; sql?: string | null; unique?: boolean }>;
  foreignKeys?: Array<{
    name?: string;
    columns?: string[];
    refTable?: string;
    refColumns?: string[];
    refSchema?: string;
  }>;
  createSql?: string | null;
};

export type DatabaseRowsResponse = {
  ok: boolean;
  source: DatabaseSource;
  rows: Record<string, unknown>[];
  columns: DatabaseColumnInfo[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  error?: string;
};

export type DatabaseQueryResponse = {
  ok: boolean;
  source?: DatabaseSource;
  columns?: string[];
  objects?: Record<string, unknown>[];
  rows?: unknown[][];
  rowCount?: number;
  durationMs?: number;
  rowsRead?: number;
  rowsWritten?: number;
  changes?: number;
  error?: string;
  requires_approval?: boolean;
  requires_destructive_confirmation?: boolean;
};

export type DatabaseStudioClient = ReturnType<typeof createDatabaseStudioClient>;

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    const error = new Error(body?.error || `Database request failed (${response.status})`);
    Object.assign(error, body, { status: response.status });
    throw error;
  }
  return body;
}

export function createDatabaseStudioClient(baseUrl = "/api/database") {
  const base = baseUrl.replace(/\/$/, "");
  const fetchJson = async <T>(path: string, init?: RequestInit) => {
    const response = await fetch(`${base}${path}`, {
      credentials: "same-origin",
      ...init,
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(init?.headers || {}),
      },
    });
    return readJson<T>(response);
  };

  return {
    listSources() {
      return fetchJson<DatabaseSourcesResponse>("/sources");
    },

    metrics(sourceId: string, range: string) {
      const query = new URLSearchParams({ source_id: sourceId, range });
      return fetchJson<DatabaseMetricsResponse>(`/metrics?${query}`);
    },

    listTables(sourceId: string) {
      const query = new URLSearchParams({ source_id: sourceId });
      return fetchJson<{ ok: boolean; source: DatabaseSource; tables: DatabaseTableInfo[] }>(
        `/tables?${query}`,
      );
    },

    schema(sourceId: string, table: DatabaseTableInfo) {
      const query = new URLSearchParams({ source_id: sourceId, table: table.name });
      if (table.schema) query.set("schema", table.schema);
      return fetchJson<{ ok: boolean; source: DatabaseSource; schema: DatabaseSchemaInfo }>(
        `/schema?${query}`,
      );
    },

    rows(
      sourceId: string,
      table: DatabaseTableInfo,
      options: { page?: number; limit?: number; sort?: string; dir?: "asc" | "desc" } = {},
    ) {
      const query = new URLSearchParams({
        source_id: sourceId,
        table: table.name,
        page: String(options.page || 1),
        limit: String(options.limit || 50),
      });
      if (table.schema) query.set("schema", table.schema);
      if (options.sort) query.set("sort", options.sort);
      if (options.dir) query.set("dir", options.dir);
      return fetchJson<DatabaseRowsResponse>(`/rows?${query}`);
    },

    query(sourceId: string, input: {
      sql: string;
      params?: unknown[];
      studio_approved?: boolean;
      destructive_confirmed?: boolean;
    }) {
      return fetchJson<DatabaseQueryResponse>("/query", {
        method: "POST",
        body: JSON.stringify({ source_id: sourceId, ...input }),
      });
    },

    insert(sourceId: string, table: DatabaseTableInfo, values: Record<string, unknown>) {
      return fetchJson<{ ok: boolean; result: { changes?: number; row?: unknown } }>("/rows", {
        method: "POST",
        body: JSON.stringify({
          source_id: sourceId,
          table: table.name,
          schema: table.schema,
          values,
        }),
      });
    },

    update(
      sourceId: string,
      table: DatabaseTableInfo,
      values: Record<string, unknown>,
      where: Record<string, unknown>,
    ) {
      return fetchJson<{ ok: boolean; result: { changes?: number; rows?: unknown[] } }>("/rows", {
        method: "PATCH",
        body: JSON.stringify({
          source_id: sourceId,
          table: table.name,
          schema: table.schema,
          values,
          where,
        }),
      });
    },

    delete(sourceId: string, table: DatabaseTableInfo, where: Record<string, unknown>) {
      return fetchJson<{ ok: boolean; result: { changes?: number; rows?: unknown[] } }>("/rows", {
        method: "DELETE",
        body: JSON.stringify({
          source_id: sourceId,
          table: table.name,
          schema: table.schema,
          where,
        }),
      });
    },
  };
}
