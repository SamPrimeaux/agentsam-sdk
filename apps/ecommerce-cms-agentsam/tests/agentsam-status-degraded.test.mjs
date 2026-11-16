import test from 'node:test';
import assert from 'node:assert/strict';
import { agentsamStatus } from '../backend/admin/agentsam.js';

test('AgentSam status stays available when optional MCP/registry diagnostics fail', async () => {
  // The admin status panel is not a required dependency of page editing.
  const db = { prepare() { throw new Error('simulated DB outage'); } };
  const response = await agentsamStatus({ DB: db }, 'test-user', 'test-account');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.partial, true);
  assert.ok(body.unavailable_sections.includes('mcp_servers'));
  assert.ok(body.unavailable_sections.includes('connect_urls'));
  assert.deepEqual(body.mcp_servers, []);
  assert.equal(body.connect_urls.ok, false);
});
