import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.resolve(HERE, "../scripts/local-sqlite-bridge.mjs");

function invoke(request) {
  const result = spawnSync(process.execPath, [BRIDGE], {
    input: JSON.stringify(request),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("AgentSam local database follows project config instead of a hardcoded .agentsam/data path", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentsam-db-bridge-"));
  try {
    fs.mkdirSync(path.join(root, ".agentsam"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".agentsam", "config.json"),
      JSON.stringify({ local: { database: ".state/runtime.sqlite" } }, null, 2),
    );

    const configured = path.join(root, ".state", "runtime.sqlite");
    fs.mkdirSync(path.dirname(configured), { recursive: true });
    const db = new DatabaseSync(configured);
    db.exec("CREATE TABLE proof (id INTEGER PRIMARY KEY, value TEXT NOT NULL);");
    db.close();

    const status = invoke({ op: "status", cwd: root });
    assert.equal(status.ok, true);
    assert.equal(status.root, root);
    assert.equal(status.default_path, configured);
    assert.equal(status.exists, true);

    const listed = invoke({ op: "list", cwd: root });
    const agentsam = listed.refs.find((ref) => ref.id === "local-sqlite:agentsam");
    assert.ok(agentsam);
    assert.equal(agentsam.pathHint, ".state/runtime.sqlite");

    const opened = invoke({ op: "open_agentsam", cwd: root });
    assert.equal(opened.source.id, "local-sqlite:agentsam");
    assert.equal(opened.source.database_name, "runtime.sqlite");
    assert.equal(opened.source.num_tables, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("legacy db_path remains supported for portable project compatibility", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentsam-db-legacy-"));
  try {
    fs.mkdirSync(path.join(root, ".agentsam"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".agentsam", "config.json"),
      JSON.stringify({ db_path: ".agentsam/legacy.sqlite" }, null, 2),
    );
    const configured = path.join(root, ".agentsam", "legacy.sqlite");
    const db = new DatabaseSync(configured);
    db.exec("CREATE TABLE legacy_proof (id INTEGER PRIMARY KEY);");
    db.close();

    const status = invoke({ op: "status", cwd: root });
    assert.equal(status.default_path, configured);
    assert.equal(status.exists, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("registered local SQLite sources resolve by source_id instead of being forced to the AgentSam database", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentsam-db-multi-"));
  try {
    fs.mkdirSync(path.join(root, ".agentsam", "data"), { recursive: true });
    const agentsamPath = path.join(root, ".agentsam", "data", "agentsam.sqlite");
    const agentsamDb = new DatabaseSync(agentsamPath);
    agentsamDb.exec("CREATE TABLE agentsam_only (id INTEGER PRIMARY KEY);");
    agentsamDb.close();

    const customPath = path.join(root, "customer.sqlite");
    const customDb = new DatabaseSync(customPath);
    customDb.exec("CREATE TABLE customer_only (id INTEGER PRIMARY KEY, name TEXT);");
    customDb.close();

    const opened = invoke({ op: "open_database", cwd: root, path: customPath });
    assert.match(opened.sourceId, /^local-sqlite:file:/);

    const tables = invoke({
      op: "tables",
      cwd: root,
      source_id: opened.sourceId,
    });
    assert.deepEqual(
      tables.tables.map((table) => table.name),
      ["customer_only"],
    );

    const agentsamTables = invoke({
      op: "tables",
      cwd: root,
      source_id: "local-sqlite:agentsam",
    });
    assert.deepEqual(
      agentsamTables.tables.map((table) => table.name),
      ["agentsam_only"],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function rawInvoke(request) {
  const child = spawnSync(process.execPath, [BRIDGE], { input: JSON.stringify(request), encoding: "utf8" });
  return { status: child.status, result: JSON.parse(child.stdout) };
}

test("finds repository SQLite from a nested folder, not an unrelated cwd", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentsam-db-nested-"));
  try {
    const project = path.join(root, "project");
    const nested = path.join(project, "src", "deep", "code");
    fs.mkdirSync(path.join(project, ".agentsam", "data"), { recursive: true });
    fs.mkdirSync(nested, { recursive: true });
    const filename = path.join(project, ".agentsam", "data", "agentsam.sqlite");
    const db = new DatabaseSync(filename);
    db.exec("CREATE TABLE nested_marker (id INTEGER PRIMARY KEY);");
    db.close();
    const status = invoke({ op: "status", cwd: nested });
    assert.equal(status.root, project);
    assert.equal(status.default_path, filename);
    const described = invoke({ op: "open_agentsam", cwd: nested });
    assert.equal(described.source.path_hint, filename);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("SQL editor bridge returns real rows and guards local writes with approvals", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentsam-db-sql-"));
  try {
    const file = path.join(root, ".agentsam", "data", "agentsam.sqlite");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);");
    db.close();
    const base = { cwd: root, source_id: "local-sqlite:agentsam" };
    const read = invoke({ ...base, op: "query", sql: "SELECT id, body FROM notes" });
    assert.deepEqual(read.columns, ["id", "body"]);
    assert.deepEqual(read.objects, []);
    const blocked = rawInvoke({ ...base, op: "query", sql: "INSERT INTO notes (body) VALUES ('hello')" });
    assert.notEqual(blocked.status, 0);
    assert.equal(blocked.result.requires_approval, true);
    assert.equal(invoke({ ...base, op: "query", sql: "INSERT INTO notes (body) VALUES (?)", params: ["hello"], studio_approved: true }).ok, true);
    const queried = invoke({ ...base, op: "query", sql: "SELECT id, body FROM notes" });
    assert.equal(queried.objects[0].body, "hello");
    const added = invoke({ ...base, op: "insert", table: "notes", values: { body: "second" } });
    assert.equal(added.result.changes, 1);
    const updated = invoke({ ...base, op: "update", table: "notes", values: { body: "revised" }, where: { id: 1 } });
    assert.equal(updated.result.changes, 1);
    const deleted = invoke({ ...base, op: "delete", table: "notes", where: { id: 2 } });
    assert.equal(deleted.result.changes, 1);
    const final = invoke({ ...base, op: "query", sql: "SELECT body FROM notes" });
    assert.deepEqual(final.objects.map((x) => x.body), ["revised"]);
    const writePragma = rawInvoke({ ...base, op: "query", sql: "PRAGMA user_version=5" });
    assert.equal(writePragma.result.requires_approval, true);
    const destructive = rawInvoke({ ...base, op: "query", sql: "DROP TABLE notes", studio_approved: true });
    assert.equal(destructive.result.requires_destructive_confirmation, true);
    const pragma = invoke({ ...base, op: "query", sql: "PRAGMA journal_mode" });
    assert.equal(String(pragma.rows[0][0]).toLowerCase(), "wal");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
