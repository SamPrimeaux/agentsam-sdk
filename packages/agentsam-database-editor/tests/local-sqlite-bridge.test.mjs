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
