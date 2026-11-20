import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../backend/migrations/1378_agentsam_tools_account_plugin_key_unique.sql", import.meta.url),
  "utf8",
);

test("forward-only tool index migration retains existing plugin FK and joins by stable key", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec([
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE agentsam_plugins (id TEXT PRIMARY KEY, plugin_key TEXT NOT NULL);",
      "CREATE TABLE agentsam_tools (id TEXT PRIMARY KEY, account_id TEXT, plugin_id TEXT REFERENCES agentsam_plugins(id) ON DELETE SET NULL, plugin_key TEXT, tool_key TEXT, handler_type TEXT NOT NULL DEFAULT 'mcp', use_count INTEGER NOT NULL DEFAULT 0);",
      "CREATE UNIQUE INDEX idx_agentsam_tools_account_plugin_tool_key ON agentsam_tools(account_id,plugin_id,tool_key) WHERE account_id IS NOT NULL AND plugin_id IS NOT NULL AND tool_key IS NOT NULL;",
      "CREATE VIEW v_existing_tool_runtime AS SELECT id,handler_type,plugin_id,use_count FROM agentsam_tools;",
      "INSERT INTO agentsam_plugins VALUES ('p1','cloudflare'),('p2','google_gmail');",
      "INSERT INTO agentsam_tools VALUES ('t1','acct1','p1',NULL,'docs','mcp',37);",
      "INSERT INTO agentsam_tools VALUES ('t2','acct1','p2','google_gmail','mail','mcp',12);",
      "INSERT INTO agentsam_tools VALUES ('t3','acct2','p1','cloudflare','docs','mcp',4);",
    ].join("\n"));
    db.exec(migration);
    db.exec(migration);
    assert.deepEqual(
      db.prepare("SELECT id,plugin_id,plugin_key,use_count FROM agentsam_tools ORDER BY id").all().map(r => [r.id,r.plugin_id,r.plugin_key,r.use_count]),
      [["t1","p1","cloudflare",37],["t2","p2","google_gmail",12],["t3","p1","cloudflare",4]],
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM v_existing_tool_runtime").get().n, 3);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(db.prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE name='idx_agentsam_tools_account_plugin_tool_key'"
    ).get().n, 1);
    assert.throws(() => db.prepare(
      "INSERT INTO agentsam_tools(id,account_id,plugin_key,tool_key) VALUES ('dup','acct1','cloudflare','docs')"
    ).run(), /UNIQUE constraint failed/);
    db.prepare("INSERT INTO agentsam_tools(id,account_id,plugin_key,tool_key) VALUES ('t4','acct3','cloudflare','docs')").run();
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agentsam_tools").get().n, 4);
  } finally {
    db.close();
  }
});
