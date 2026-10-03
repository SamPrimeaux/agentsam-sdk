import {
  createDatabaseStudioClient,
  type DatabaseHttpFetch,
  type DatabaseSource,
  type DatabaseStudioClient,
  type DatabaseTableInfo,
} from "@inneranimalmedia/agentsam-database-editor/frontend";
import { createLocalStudioLocalHost, localBridgeDispatch, type LocalStudioLocalHostOptions } from "./localHost";
import { invokeStudioService, isPackagedDesktop, resolveDesktopStudioAccountId } from "@/lib/desktop/tauri";

const desktopDatabaseFetch: DatabaseHttpFetch = async (input, init) => {
  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const parsed = new URL(rawUrl, "https://local.studio.invalid");
  const path = parsed.pathname + parsed.search;
  const method = String(init?.method || "GET").toUpperCase() as "GET" | "POST" | "PATCH" | "DELETE";
  let body: unknown = undefined;
  if (typeof init?.body === "string" && init.body) {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = init.body;
    }
  }
  const accountId = await resolveDesktopStudioAccountId();
  const bridged = await invokeStudioService({
    operation: "database",
    account_id: accountId,
    method,
    path,
    body,
  });
  return new Response(bridged.body, {
    status: bridged.status,
    headers: { "content-type": bridged.content_type || "application/json" },
  });
};

const LOCAL_DATABASE_CAPABILITIES = {
  read_rows: true,
  query: true,
  schema: true,
  insert: true,
  update: true,
  delete: true,
  metrics: false,
  export: false,
  transactions: false,
} as const;

function withLocalCapabilities(source: DatabaseSource): DatabaseSource {
  return {
    ...source,
    capabilities: { ...LOCAL_DATABASE_CAPABILITIES, ...(source.capabilities || {}) },
  };
}

function isLocalSourceId(sourceId: string) {
  return String(sourceId || "").startsWith("local-sqlite:");
}

/**
 * Merge remote Worker /api/database with machine-local SQLite when a local
 * runtime bridge is available. Never invents fake local sources on pure hosted.
 */
export function createLocalStudioDatabaseClient(
  baseUrl = "/api/database",
  localOptions: LocalStudioLocalHostOptions = {},
): DatabaseStudioClient & { localHost: ReturnType<typeof createLocalStudioLocalHost> } {
  const remote = createDatabaseStudioClient(baseUrl, {
    fetch: isPackagedDesktop() ? desktopDatabaseFetch : undefined,
  });
  const localHost = createLocalStudioLocalHost(localOptions);

  return {
    localHost,

    async listSources() {
      const remoteCatalog = await remote.listSources();
      let localSources: DatabaseSource[] = [];
      let localStatus = "requires_local_runtime";
      let localMessage =
        "Attach AgentSam Local Studio / local runtime to inspect the configured AgentSam local database.";

      try {
        const status = await localHost.status();
        const listed = await localHost.list();
        if (status === "available" && listed.length) {
          localStatus = "connected";
          localMessage = "Local SQLite via AgentSam local runtime";
          for (const ref of listed) {
            const isAgentSam = ref.kind === "agentsam" || ref.id === "local-sqlite:agentsam";
            const opened = await localBridgeDispatch(
              isAgentSam
                ? { op: "open_agentsam" }
                : { op: "open_database", ref: ref.ref, source_id: ref.id },
              localOptions,
            );
            if (opened.source && typeof opened.source === "object") {
              localSources.push(withLocalCapabilities(opened.source as DatabaseSource));
            } else {
              localSources.push({
                id: ref.id,
                provider: "local-sqlite",
                engine: "sqlite",
                label: ref.label || (isAgentSam ? "AgentSam local database" : "Local SQLite database"),
                writable: ref.writable !== false,
                metrics: false,
                capabilities: LOCAL_DATABASE_CAPABILITIES,
                connection: "local_runtime",
              });
            }
          }
        } else if (status === "attachable") {
          localStatus = "attachable";
          localMessage =
            "Local runtime detected or installable — open AgentSam local database to attach.";
        }
      } catch {
        localStatus = "attachable";
      }

      return {
        ...remoteCatalog,
        sources: [...localSources, ...(remoteCatalog.sources || [])],
        connections: {
          ...(remoteCatalog.connections || {}),
          local_sqlite: {
            status: localStatus,
            message: localMessage,
          },
        },
      };
    },

    async metrics(sourceId: string, range: string) {
      if (!isLocalSourceId(sourceId)) return remote.metrics(sourceId, range);
      const tables = await localBridgeDispatch({
        op: "tables",
        source_id: sourceId,
      }, localOptions);
      const source = (tables.source || {
        id: sourceId,
        provider: "local-sqlite",
        engine: "sqlite",
        label: sourceId === "local-sqlite:agentsam" ? "AgentSam local database" : "Local SQLite database",
        writable: true,
        metrics: false,
        capabilities: LOCAL_DATABASE_CAPABILITIES,
      }) as DatabaseSource;
      const tableCount = Array.isArray(tables.tables) ? tables.tables.length : 0;
      return {
        ok: true,
        source,
        range,
        kpis: {
          tables: tableCount,
          queries: null,
          rowsRead: null,
          rowsWritten: null,
          storage: source.file_size ?? null,
          connections: 1,
        },
        capacity: {
          usedBytes: source.file_size ?? null,
          limitBytes: null,
          pctUsed: null,
        },
        series: [],
        health: { status: "healthy", detail: "local_sqlite", latencyMs: 0 },
      };
    },

    async listTables(sourceId: string) {
      if (!isLocalSourceId(sourceId)) return remote.listTables(sourceId);
      const body = await localBridgeDispatch({
        op: "tables",
        source_id: sourceId,
      }, localOptions);
      return {
        ok: true,
        source: body.source as DatabaseSource,
        tables: (body.tables || []) as DatabaseTableInfo[],
      };
    },

    async schema(sourceId: string, table: DatabaseTableInfo) {
      if (!isLocalSourceId(sourceId)) return remote.schema(sourceId, table);
      const body = await localBridgeDispatch({
        op: "schema",
        source_id: sourceId,
        table: table.name,
      }, localOptions);
      return {
        ok: true,
        source: {
          id: sourceId,
          provider: "local-sqlite",
          engine: "sqlite",
          label: "AgentSam local database",
          writable: true,
          metrics: false,
          capabilities: LOCAL_DATABASE_CAPABILITIES,
        },
        schema: body.schema as never,
      };
    },

    async rows(sourceId: string, table: DatabaseTableInfo, options = {}) {
      if (!isLocalSourceId(sourceId)) return remote.rows(sourceId, table, options);
      const body = await localBridgeDispatch({
        op: "rows",
        source_id: sourceId,
        table: table.name,
        page: options.page || 1,
        limit: options.limit || 50,
      }, localOptions);
      return {
        ok: true,
        source: {
          id: sourceId,
          provider: "local-sqlite",
          engine: "sqlite",
          label: "AgentSam local database",
          writable: true,
          metrics: false,
          capabilities: LOCAL_DATABASE_CAPABILITIES,
        },
        rows: (body.rows || []) as Record<string, unknown>[],
        columns: (body.columns || []) as never[],
        page: Number(body.page || 1),
        limit: Number(body.limit || 50),
        total: Number(body.total || 0),
        total_pages: Number(body.total_pages || 1),
      };
    },

    async query(sourceId: string, input) {
      if (!isLocalSourceId(sourceId)) return remote.query(sourceId, input);
      const body = await localBridgeDispatch({
        op: "query",
        source_id: sourceId,
        sql: input.sql,
        params: input.params || [],
      }, localOptions);
      return { ok: true, ...body };
    },

    async insert(sourceId: string, table: DatabaseTableInfo, values: Record<string, unknown>) {
      if (!isLocalSourceId(sourceId)) return remote.insert(sourceId, table, values);
      const body = await localBridgeDispatch({
        op: "insert",
        source_id: sourceId,
        table: table.name,
        values,
      }, localOptions);
      return { ok: true, result: body.result as never };
    },

    async update(
      sourceId: string,
      table: DatabaseTableInfo,
      values: Record<string, unknown>,
      where: Record<string, unknown>,
    ) {
      if (!isLocalSourceId(sourceId)) return remote.update(sourceId, table, values, where);
      const body = await localBridgeDispatch({
        op: "update",
        source_id: sourceId,
        table: table.name,
        values,
        where,
      }, localOptions);
      return { ok: true, result: body.result as never };
    },

    async delete(sourceId: string, table: DatabaseTableInfo, where: Record<string, unknown>) {
      if (!isLocalSourceId(sourceId)) return remote.delete(sourceId, table, where);
      const body = await localBridgeDispatch({
        op: "delete",
        source_id: sourceId,
        table: table.name,
        where,
      }, localOptions);
      return { ok: true, result: body.result as never };
    },
  };
}
