import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const apply = (db, name) =>
  db.exec(readFileSync(new URL(`../../migrations/d1/${name}`, import.meta.url), 'utf8'));

// The SDK migrations overlay a host schema, so the host-owned tables the ops
// trail reads are stubbed here. agentsam_mcp_tool_execution is deliberately absent.
function host() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE agentsam_agent_run (id TEXT, created_at_unix INTEGER, status TEXT, account_id TEXT, conversation_id TEXT, model_key TEXT);
    CREATE TABLE agentsam_error_log (id TEXT, created_at INTEGER, error_type TEXT, account_id TEXT, session_id TEXT, source TEXT, error_message TEXT);
    CREATE TABLE agentsam_deployment_health (id TEXT, checked_at_unix INTEGER, last_checked_at INTEGER, status TEXT, account_id TEXT, worker_name TEXT, error_message TEXT);
  `);
  apply(db, '0001_agentsam_plugin_runtime.sql');
  return db;
}

test('replaying 0007 leaves a view that reads the retired table; 0031 repairs it', () => {
  const db = host();
  try {
    apply(db, '0007_repair_ops_trail_agent_run_account.sql');
    assert.throws(() => db.prepare('SELECT COUNT(*) AS n FROM v_agentsam_ops_trail').get(), /agentsam_mcp_tool_execution/);

    apply(db, '0031_ops_trail_single_tool_call_source.sql');
    db.prepare("INSERT INTO agentsam_tool_call_log (account_id, tool_key, status, error_code) VALUES ('acct_1','agentsam_ping','error','boom')").run();
    const rows = db.prepare("SELECT source_table, user_id, detail, error_message FROM v_agentsam_ops_trail WHERE source_table = 'tool_call_log'").all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, 'acct_1');
    assert.equal(rows[0].detail, 'agentsam_ping');
    assert.equal(rows[0].error_message, 'boom');
    const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'v_agentsam_ops_trail'").get().sql;
    assert.equal(ddl.includes('mcp_tool_execution'), false);
  } finally { db.close(); }
});
