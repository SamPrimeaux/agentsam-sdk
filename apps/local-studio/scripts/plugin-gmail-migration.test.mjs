import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { isEngineEligible, migrationEngine, POSTGRES_ENGINE } from "./migration-plan.mjs";

const sql = readFileSync(new URL("../backend/migrations/1353_link_google_gmail_tools_to_plugin.sql", import.meta.url), "utf8");

test("Gmail tool reconciliation is a D1-only migration", () => {
  assert.equal(migrationEngine(sql), "d1");
  assert.equal(isEngineEligible(sql, POSTGRES_ENGINE), false);
  assert.equal(isEngineEligible(sql, "d1"), true);
});

test("Gmail tool reconciliation is idempotent and leaves global tools global", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE agentsam_plugins(id TEXT PRIMARY KEY, plugin_key TEXT, provider_key TEXT, plugin_kind TEXT);
      CREATE TABLE agentsam_tools(tool_name TEXT PRIMARY KEY, plugin_id TEXT, plugin_key TEXT, account_id TEXT);
      INSERT INTO agentsam_plugins VALUES
        ('gmail-plugin', 'google-gmail', 'google_gmail', 'oauth'),
        ('github-plugin', 'github', 'github', 'oauth');
      INSERT INTO agentsam_tools VALUES
        ('gmail_list_inbox', NULL, NULL, NULL),
        ('agentsam_gmail_mcp_create_draft', NULL, NULL, NULL),
        ('gmail_send', 'gmail-plugin', 'google-gmail', NULL),
        ('agentsam_github_tree', NULL, NULL, NULL),
        ('gmail_special', NULL, NULL, 'account-other');
    `);
    for (let run = 0; run < 2; run++) db.exec(sql);
    const rows = db.prepare("SELECT tool_name, plugin_id, plugin_key, account_id FROM agentsam_tools ORDER BY tool_name").all();
    for (const row of rows) {
      if (row.tool_name.startsWith("gmail_") || row.tool_name.startsWith("agentsam_gmail_mcp_")) {
        assert.equal(row.plugin_id, "gmail-plugin");
        assert.equal(row.plugin_key, "google-gmail");
      } else {
        assert.equal(row.plugin_id, null);
      }
    }
    assert.equal(rows.find(row => row.tool_name === "gmail_special").account_id, "account-other");
    assert.equal(rows.find(row => row.tool_name === "agentsam_github_tree").plugin_id, null);
  } finally {
    db.close();
  }
});
