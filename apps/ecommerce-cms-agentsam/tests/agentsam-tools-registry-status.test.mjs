import test from 'node:test';
import assert from 'node:assert/strict';
import { __setApplicationAccountId } from '../backend/lib/account-context.js';
import { getToolsRegistryStatus, listAgentSamMcpServers, listToolPolicyKeys } from '../backend/agentsam/tools-registry.js';

function db(queries) {
  const stmt = (sql, params) => ({
    async first() {
      if (sql.includes('agentsam_tool_policy_keys')) return { n: 4 };
      assert.equal(params[0], 'account_fixture');
      return { n: sql.includes('COUNT(DISTINCT p.id)') ? 2 : 7 };
    },
    async all() {
      if (sql.includes('agentsam_tool_policy_keys')) {
        assert.deepEqual(params, ['agent_chat_essential']);
        return { results: [{ tool_key: 'approved.tool', sort_order: 10 }] };
      }
      return { results: [] };
    },
  });
  return { prepare(sql) {
    queries.push(sql);
    return { ...stmt(sql, []), bind(...params) { return stmt(sql, params); } };
  } };
}

test('status uses account installations instead of nonexistent legacy MCP account_id column', async () => {
  const queries = [];
  __setApplicationAccountId('account_fixture');
  try {
    const value = await getToolsRegistryStatus({ DB: db(queries) });
    assert.deepEqual(value, { tools_registry_count: 7, mcp_servers_registered: 2, tool_policy_keys_count: 4 });
    assert.equal(queries.length, 3);
    assert.ok(queries.every(sql => !sql.includes('FROM agentsam_mcp_servers')));
    assert.match(queries[1], /agentsam_plugin_installations/);
  } finally { __setApplicationAccountId(null); }
});

test('MCP list does not expose global legacy servers with no account-owned plugin', async () => {
  const queries = [];
  __setApplicationAccountId('account_fixture');
  try {
    const servers = await listAgentSamMcpServers({ DB: db(queries) });
    assert.deepEqual(servers, []);
    assert.equal(queries.length, 1);
    assert.ok(queries[0].includes('agentsam_plugin_installations'));
  } finally { __setApplicationAccountId(null); }
});

test('global tool policies are read from their real unscoped schema', async () => {
  const queries = [];
  const rows = await listToolPolicyKeys({ DB: db(queries) }, 'agent_chat_essential');
  assert.deepEqual(rows.map(row => row.tool_key), ['approved.tool']);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /WHERE policy_kind = \?/);
  assert.doesNotMatch(queries[0], /account_id/);
});
