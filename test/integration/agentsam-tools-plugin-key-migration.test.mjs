import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

function apply(db, name) {
  db.exec(readFileSync(new URL(`../../migrations/d1/${name}`, import.meta.url), 'utf8'));
}

test('Cloudflare tool registrations survive plugin registry cutover by natural plugin_key', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    apply(db, '0001_agentsam_plugin_runtime.sql');
    db.exec(`
      CREATE TABLE agentsam_cloudflare_oauth_state (state TEXT PRIMARY KEY, account_id TEXT);
      INSERT INTO agentsam_plugins (
        id,account_id,environment,plugin_key,provider_key,installation_key,
        plugin_kind,category,display_name,transport,auth_type
      ) VALUES (
        'plg_a13ac0e56815514d','acct_migration','production','cloudflare','cloudflare',
        'local-studio-pkce','oauth','developer_platform','Cloudflare','http_rest','oauth'
      );
    `);
    apply(db, '0003_expand_tool_handler_families.sql');
    apply(db, '0009_normalize_cloudflare_plugin_installations.sql');
    apply(db, '0012_agentsam_tools_required_seed.sql');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agentsam_tools WHERE plugin_key='agentsam-mcp'").get().n, 3);
    apply(db, '0022_agentsam_plugin_registry.sql');
    apply(db, '0023_agentsam_plugin_install_health.sql');
    apply(db, '0028_drop_unused_tool_handler_families.sql');
    apply(db, '0029_agentsam_tools_account_plugin_key_unique.sql');

    const tools = db.prepare(`SELECT tool_key,plugin_key,handler_key,dispatch_target
      FROM agentsam_tools WHERE plugin_key='agentsam-mcp' ORDER BY tool_key`).all();
    assert.deepEqual(tools.map(row => row.tool_key), [
      'agentsam-mcp.docs','agentsam-mcp.execute','agentsam-mcp.search',
    ]);
    assert.ok(tools.every(row => row.plugin_key === 'agentsam-mcp'));
    assert.ok(tools.every(row => row.handler_key));
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);

    const toolColumns = new Set(db.prepare("SELECT name FROM pragma_table_info('agentsam_tools')").all().map(row => row.name));
    for (const retained of ['handler_type','plugin_id','use_count','last_used_at']) assert.equal(toolColumns.has(retained), true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='idx_agentsam_tools_account_plugin_key_tool_key'").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='agentsam_tool_handler_families'").get().n, 0);
  } finally {
    db.close();
  }
});
