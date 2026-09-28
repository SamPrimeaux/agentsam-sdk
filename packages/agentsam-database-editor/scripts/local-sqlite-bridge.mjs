#!/usr/bin/env node
/**
 * Local-runtime SQLite bridge for AgentSam Database Studio.
 * Reads one JSON request from stdin, writes one JSON response to stdout.
 * Never used from Workers / browsers — Node + node:sqlite only.
 *
 * Ops: status | list | create_database | open_database | open_agentsam |
 * rename_database | move_database | detach_database | delete_database |
 * tables | schema | rows | query | insert | update | delete
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createSqliteAdapter } from "../src/adapters/sqlite.js";

const REGISTRY_SCHEMA = "agentsam.local-databases.v1";

function agentsamHome() {
  return path.resolve(String(process.env.AGENTSAM_HOME || path.join(os.homedir(), ".agentsam")));
}

function registryPath() {
  return path.join(agentsamHome(), "local-databases.json");
}

function readRegistry() {
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath(), "utf8"));
    return {
      schema: REGISTRY_SCHEMA,
      databases: Array.isArray(parsed.databases) ? parsed.databases : [],
    };
  } catch {
    return { schema: REGISTRY_SCHEMA, databases: [] };
  }
}

function writeRegistry(registry) {
  fs.mkdirSync(path.dirname(registryPath()), { recursive: true });
  const tmp = `${registryPath()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ ...registry, schema: REGISTRY_SCHEMA }, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, registryPath());
}

function idForPath(filePath) {
  const hash = createHash("sha256").update(path.resolve(filePath)).digest("hex").slice(0, 20);
  return `local-sqlite:file:${hash}`;
}

function refForPath(filePath) {
  return `ldbref:${Buffer.from(path.resolve(filePath)).toString("base64url")}`;
}

function pathFromRef(ref) {
  const value = String(ref || "").trim();
  if (!value.startsWith("ldbref:")) return "";
  try {
    return path.resolve(Buffer.from(value.slice("ldbref:".length), "base64url").toString("utf8"));
  } catch {
    return "";
  }
}

function ensureSqlitePath(filePath) {
  const resolved = path.resolve(filePath);
  if (!/\.(sqlite|sqlite3|db)$/i.test(resolved)) throw new Error("sqlite_extension_required");
  return resolved;
}

function registryEntry(filePath, values = {}) {
  const resolved = ensureSqlitePath(filePath);
  return {
    id: idForPath(resolved),
    label: String(values.label || path.basename(resolved)),
    ref: refForPath(resolved),
    path: resolved,
    project_id: values.project_id || null,
    preset: values.preset || "custom",
    last_opened_at: new Date().toISOString(),
  };
}

function upsertRegistry(filePath, values = {}) {
  const registry = readRegistry();
  const entry = registryEntry(filePath, values);
  registry.databases = [entry, ...registry.databases.filter((item) => item.id !== entry.id && path.resolve(String(item.path || "")) !== entry.path)];
  writeRegistry(registry);
  return entry;
}

function removeRegistry(refOrId) {
  const registry = readRegistry();
  const key = String(refOrId || "");
  const filePath = pathFromRef(key);
  registry.databases = registry.databases.filter((item) => item.id !== key && item.ref !== key && (!filePath || path.resolve(String(item.path || "")) !== filePath));
  writeRegistry(registry);
}

function resolveDatabasePath(req, defaultPath) {
  const sourceId = String(req.source_id || req.sourceId || "").trim();
  if (String(req.ref || "") === "agentsam" || sourceId === "local-sqlite:agentsam") return defaultPath;
  const directRef = pathFromRef(req.ref);
  if (directRef) return directRef;
  if (sourceId) {
    const found = readRegistry().databases.find((item) => item.id === sourceId);
    if (found?.path) return ensureSqlitePath(found.path);
  }
  const directPath = String(req.path || "").trim();
  return directPath ? ensureSqlitePath(directPath) : "";
}

async function describeDatabase(filePath, values = {}) {
  const entry = values.id === "local-sqlite:agentsam"
    ? { id: "local-sqlite:agentsam", ref: "agentsam", label: values.label || "AgentSam local database" }
    : upsertRegistry(filePath, values);
  const adapter = openAdapter(filePath, { id: entry.id });
  try {
    const tables = await adapter.listTables();
    return {
      sourceId: entry.id,
      ref: {
        id: entry.id,
        label: entry.label,
        ref: entry.ref,
        pathHint: filePath,
        kind: values.kind || (entry.id === "local-sqlite:agentsam" ? "agentsam" : "recent"),
        writable: true,
        sizeBytes: fs.statSync(filePath).size,
        tableCount: tables.length,
      },
      source: {
        id: entry.id,
        provider: "local-sqlite",
        engine: "sqlite",
        label: entry.label,
        database_name: path.basename(filePath),
        file_size: fs.statSync(filePath).size,
        num_tables: tables.length,
        writable: true,
        metrics: false,
        connection: "local_runtime",
      },
    };
  } finally {
    adapter.close?.();
  }
}

function initializePreset(filePath, preset) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  try {
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS agentsam_database_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);");
    db.prepare("INSERT OR REPLACE INTO agentsam_database_meta (key, value) VALUES (?, ?)").run("preset", preset);
    if (preset === "agentsam") {
      const migrationsDir = path.resolve(String(process.env.AGENTSAM_RUNTIME_MIGRATIONS || path.join(path.dirname(new URL(import.meta.url).pathname), "../../../migrations/runtime")));
      if (fs.existsSync(migrationsDir)) {
        for (const name of fs.readdirSync(migrationsDir).filter((item) => /^\d+.*\.sql$/i.test(item)).sort()) {
          db.exec(fs.readFileSync(path.join(migrationsDir, name), "utf8"));
        }
      }
    }
  } finally {
    db.close();
  }
}

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
        sizeBytes: st.size,
      });
    }
    const recent = [...readRegistry().databases, ...(Array.isArray(req.recent) ? req.recent : [])];
    for (const item of recent) {
      const p = path.resolve(String(item.path || ""));
      if (!p || !fs.existsSync(p)) continue;
      const described = await describeDatabase(p, { label: item.label, kind: "recent" });
      if (!refs.some((ref) => ref.id === described.ref.id)) refs.push(described.ref);
    }
    return ok({ refs, status: refs.length ? "available" : "attachable", root });
  }

  if (op === "create_database") {
    const name = path.basename(String(req.name || "").trim());
    if (!name || name === "." || name === "..") throw new Error("database_name_required");
    const filename = /\.(sqlite|sqlite3|db)$/i.test(name) ? name : `${name}.sqlite`;
    const directory = pathFromRef(req.directory_ref) || String(req.directory || "").trim() || path.join(root, ".agentsam", "data");
    const filePath = ensureSqlitePath(path.join(path.resolve(directory), filename));
    if (fs.existsSync(filePath)) throw new Error("database_already_exists");
    const preset = ["empty", "agentsam", "cms", "custom"].includes(String(req.preset)) ? String(req.preset) : "empty";
    initializePreset(filePath, preset);
    const described = await describeDatabase(filePath, { label: filename, preset, kind: "created" });
    return ok(described);
  }

  if (op === "open_database") {
    const filePath = resolveDatabasePath(req, defaultPath);
    if (!filePath || !fs.existsSync(filePath)) throw new Error("local_sqlite_not_found");
    return ok(await describeDatabase(filePath, { label: req.label, kind: "recent" }));
  }

  if (op === "open_agentsam") {
    if (!fs.existsSync(defaultPath)) throw new Error("agentsam_sqlite_missing — run `agentsam db init`");
    return ok(await describeDatabase(defaultPath, { id: "local-sqlite:agentsam", label: "AgentSam local database", kind: "agentsam" }));
  }

  if (["detach_database", "delete_database", "rename_database", "move_database"].includes(op)) {
    const filePath = resolveDatabasePath(req, defaultPath);
    if (!filePath || filePath === defaultPath) throw new Error("default_agentsam_database_lifecycle_forbidden");
    if (op === "detach_database") {
      removeRegistry(req.source_id || req.ref);
      return ok({ detached: true });
    }
    if (op === "delete_database") {
      if (req.delete_file !== true) throw new Error("delete_file_confirmation_required");
      for (const target of [filePath, `${filePath}-wal`, `${filePath}-shm`]) fs.rmSync(target, { force: true });
      removeRegistry(req.source_id || req.ref);
      return ok({ deleted: true });
    }
    const nextPath = op === "move_database"
      ? ensureSqlitePath(path.join(path.resolve(pathFromRef(req.directory_ref) || String(req.directory || "")), path.basename(filePath)))
      : ensureSqlitePath(path.join(path.dirname(filePath), path.basename(String(req.name || ""))));
    if (fs.existsSync(nextPath)) throw new Error("database_already_exists");
    fs.renameSync(filePath, nextPath);
    removeRegistry(req.source_id || req.ref);
    return ok(await describeDatabase(nextPath, { label: path.basename(nextPath), kind: "recent" }));
  }

  const filePath = resolveDatabasePath(req, defaultPath);
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
