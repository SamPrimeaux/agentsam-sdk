#!/usr/bin/env node
/**
 * Local-runtime SQLite bridge for AgentSam Database Studio.
 * Reads one JSON request from stdin, writes one JSON response to stdout.
 * Never used from Workers / browsers — Node + node:sqlite only.
 *
 * Ops: status | list | open_agentsam | tables | schema | rows | query | insert | update | delete
 */
import fs from "node:fs";
import path from "node:path";
import { createSqliteAdapter } from "../src/adapters/sqlite.js";

function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 16; i += 1) {
    if (fs.existsSync(path.join(dir, ".agentsam", "config.json"))) return dir;
    if (fs.existsSync(path.join(dir, ".agentsam", "data", "agentsam.sqlite"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

function agentsamDbPath(root) {
  const envPath = String(process.env.AGENTSAM_DB || "").trim();
  if (envPath) return path.resolve(envPath);
  return path.join(root, ".agentsam", "data", "agentsam.sqlite");
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim() || "{}";
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    process.stdin.on("error", reject);
  });
}

function ok(payload) {
  process.stdout.write(JSON.stringify({ ok: true, ...payload }) + "\n");
}

function fail(error, status = 400) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      status,
    }) + "\n",
  );
  process.exitCode = 1;
}

function openAdapter(filePath, { readOnly = false, id } = {}) {
  if (!fs.existsSync(filePath)) throw new Error("local_sqlite_not_found");
  return createSqliteAdapter({ path: filePath, readOnly, id: id || `local-sqlite:${filePath}` });
}

async function main() {
  const req = await readStdin();
  const op = String(req.op || "").trim();
  const cwd = String(req.cwd || process.cwd());
  const root = findProjectRoot(cwd);
  const defaultPath = agentsamDbPath(root);

  if (op === "status") {
    const exists = fs.existsSync(defaultPath);
    return ok({
      status: exists ? "available" : "attachable",
      root,
      default_path: defaultPath,
      exists,
      size_bytes: exists ? fs.statSync(defaultPath).size : 0,
    });
  }

  if (op === "list") {
    const refs = [];
    if (fs.existsSync(defaultPath)) {
      const st = fs.statSync(defaultPath);
      refs.push({
        id: "local-sqlite:agentsam",
        label: "AgentSam local database",
        ref: "agentsam",
        pathHint: ".agentsam/data/agentsam.sqlite",
        kind: "agentsam",
        writable: true,
        size_bytes: st.size,
      });
    }
    const recent = Array.isArray(req.recent) ? req.recent : [];
    for (const item of recent) {
      const p = path.resolve(String(item.path || item.ref || ""));
      if (!p || !fs.existsSync(p)) continue;
      refs.push({
        id: `local-sqlite:file:${Buffer.from(p).toString("base64url")}`,
        label: String(item.label || path.basename(p)),
        ref: p,
        pathHint: p,
        kind: "recent",
        writable: true,
      });
    }
    return ok({ refs, status: refs.length ? "available" : "attachable", root });
  }

  if (op === "open_agentsam") {
    if (!fs.existsSync(defaultPath)) throw new Error("agentsam_sqlite_missing — run `agentsam db init`");
    const adapter = openAdapter(defaultPath, { id: "local-sqlite:agentsam" });
    const tables = await adapter.listTables();
    try {
      adapter.close?.();
    } catch {
      /* ignore */
    }
    return ok({
      sourceId: "local-sqlite:agentsam",
      source: {
        id: "local-sqlite:agentsam",
        provider: "local-sqlite",
        engine: "sqlite",
        label: "AgentSam local database",
        database_name: "agentsam.sqlite",
        file_size: fs.statSync(defaultPath).size,
        num_tables: tables.length,
        writable: true,
        metrics: false,
        connection: "local_runtime",
      },
    });
  }

  const filePath =
    String(req.path || "").trim() ||
    (String(req.ref || "") === "agentsam" || String(req.source_id || "").includes("agentsam")
      ? defaultPath
      : "");
  if (!filePath) throw new Error("sqlite_path_required");
  const sourceId = String(req.source_id || `local-sqlite:${filePath}`);
  const adapter = openAdapter(filePath, { id: sourceId, readOnly: Boolean(req.readOnly) });

  try {
    if (op === "tables") {
      const tables = await adapter.listTables();
      return ok({
        source: {
          id: sourceId,
          provider: "local-sqlite",
          engine: "sqlite",
          label: path.basename(filePath),
          writable: !req.readOnly,
          metrics: false,
          connection: "local_runtime",
          num_tables: tables.length,
          file_size: fs.statSync(filePath).size,
        },
        tables,
      });
    }

    if (op === "schema") {
      const table = String(req.table || "").trim();
      const schema = await adapter.describeTable(table);
      return ok({ schema });
    }

    if (op === "rows") {
      const table = String(req.table || "").trim();
      const page = Math.max(1, Number(req.page || 1) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.limit || 50) || 50));
      const offset = (page - 1) * limit;
      const countResult = await adapter.query({
        sql: `SELECT COUNT(*) AS c FROM "${table.replace(/"/g, '""')}"`,
      });
      const total = Number(countResult.rows?.[0]?.[0] || 0) || 0;
      const described = await adapter.describeTable(table);
      const result = await adapter.query({
        sql: `SELECT * FROM "${table.replace(/"/g, '""')}" LIMIT ? OFFSET ?`,
        params: [limit, offset],
      });
      const columns = described.columns || [];
      const objects = (result.rows || []).map((row) => {
        const obj = {};
        columns.forEach((col, i) => {
          obj[col.name] = row[i];
        });
        return obj;
      });
      return ok({
        rows: objects,
        columns,
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      });
    }

    if (op === "query") {
      const result = await adapter.query({
        sql: String(req.sql || ""),
        params: Array.isArray(req.params) ? req.params : [],
      });
      return ok(result);
    }

    if (op === "insert") {
      const result = await adapter.insert({ table: req.table, values: req.values });
      return ok({ result });
    }

    if (op === "update") {
      const result = await adapter.update({
        table: req.table,
        values: req.values,
        where: req.where,
      });
      return ok({ result });
    }

    if (op === "delete") {
      const result = await adapter.delete({ table: req.table, where: req.where });
      return ok({ result });
    }

    throw new Error(`unknown_op:${op}`);
  } finally {
    try {
      adapter.close?.();
    } catch {
      /* ignore */
    }
  }
}

main().catch((error) => fail(error));
