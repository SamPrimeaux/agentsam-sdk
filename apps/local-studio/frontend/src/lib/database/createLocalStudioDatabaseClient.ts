import {
  createDatabaseStudioClient,
  type DatabaseSource,
  type DatabaseStudioClient,
  type DatabaseTableInfo,
} from "@inneranimalmedia/agentsam-database-editor/frontend";
import { createLocalStudioLocalHost, localBridgeDispatch } from "./localHost";

function isLocalSourceId(sourceId: string) {
  return String(sourceId || "").startsWith("local-sqlite:");
}

/**
 * Merge remote Worker /api/database with machine-local SQLite when a local
 * runtime bridge is available. Never invents fake local sources on pure hosted.
 */
export function createLocalStudioDatabaseClient(
  baseUrl = "/api/database",
): DatabaseStudioClient & { localHost: ReturnType<typeof createLocalStudioLocalHost> } {
  const remote = createDatabaseStudioClient(baseUrl);
  const localHost = createLocalStudioLocalHost();

  return {
    localHost,

    async listSources() {
      const remoteCatalog = await remote.listSources();
      let localSources: DatabaseSource[] = [];
      let localStatus = "requires_local_runtime";
      let localMessage =
        "Attach AgentSam Local Studio / local runtime to inspect `.agentsam/data/agentsam.sqlite`.";

      try {
        const status = await localHost.status();
        const listed = await localHost.list();
        if (status === "available" && listed.length) {
          localStatus = "connected";
          localMessage = "Local SQLite via AgentSam local runtime";
          for (const ref of listed) {
            if (ref.kind === "agentsam" || ref.id === "local-sqlite:agentsam") {
              const opened = await localBridgeDispatch({ op: "open_agentsam", cwd: "." });
              if (opened.source && typeof opened.source === "object") {
                localSources.push(opened.source as DatabaseSource);
              } else {
                localSources.push({
                  id: "local-sqlite:agentsam",
                  provider: "local-sqlite",
                  engine: "sqlite",
                  label: ref.label || "AgentSam local database",
                  writable: true,
                  metrics: false,
                  connection: "local_runtime",
                });
              }
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
        ref: "agentsam",
        cwd: ".",
      });
      const source = (tables.source || {
        id: sourceId,
        provider: "local-sqlite",
        engine: "sqlite",
        label: "AgentSam local database",
        writable: true,
        metrics: false,
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
        ref: "agentsam",
        cwd: ".",
      });
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
        ref: "agentsam",
        table: table.name,
        cwd: ".",
      });
      return {
        ok: true,
        source: {
          id: sourceId,
          provider: "local-sqlite",
          engine: "sqlite",
          label: "AgentSam local database",
          writable: true,
          metrics: false,
        },
        schema: body.schema as never,
      };
    },

    async rows(sourceId: string, table: DatabaseTableInfo, options = {}) {
      if (!isLocalSourceId(sourceId)) return remote.rows(sourceId, table, options);
      const body = await localBridgeDispatch({
        op: "rows",
        source_id: sourceId,
        ref: "agentsam",
        table: table.name,
        page: options.page || 1,
        limit: options.limit || 50,
        cwd: ".",
      });
      return {
        ok: true,
        source: {
          id: sourceId,
          provider: "local-sqlite",
          engine: "sqlite",
          label: "AgentSam local database",
          writable: true,
          metrics: false,
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
        ref: "agentsam",
        sql: input.sql,
        params: input.params || [],
        cwd: ".",
      });
      return { ok: true, ...body };
    },

    async insert(sourceId: string, table: DatabaseTableInfo, values: Record<string, unknown>) {
      if (!isLocalSourceId(sourceId)) return remote.insert(sourceId, table, values);
      const body = await localBridgeDispatch({
        op: "insert",
        source_id: sourceId,
        ref: "agentsam",
        table: table.name,
        values,
        cwd: ".",
      });
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
        ref: "agentsam",
        table: table.name,
        values,
        where,
        cwd: ".",
      });
      return { ok: true, result: body.result as never };
    },

    async delete(sourceId: string, table: DatabaseTableInfo, where: Record<string, unknown>) {
      if (!isLocalSourceId(sourceId)) return remote.delete(sourceId, table, where);
      const body = await localBridgeDispatch({
        op: "delete",
        source_id: sourceId,
        ref: "agentsam",
        table: table.name,
        where,
        cwd: ".",
      });
      return { ok: true, result: body.result as never };
    },
  };
}
