import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  MCP_PRESETS,
  deleteMcpServer,
  getClientConfigPath,
  getSessionToolReceipts,
  inspectClientAdapter,
  listMcpServers,
  readMcpServer,
  recordToolReceipt,
  removeServerFromClient,
  summarizeToolReceipts,
  syncServerToClient,
  writeMcpServer,
} from '../../src/mcp/index.js';
import { runMcp } from '../../src/commands/mcp.js';

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-mcp-test-'));
}

test('MCP authority store manages servers under ~/.agentsam/mcp with safe permissions', () => {
  const home = tempHome();
  const config = {
    url: 'https://mcp.inneranimalmedia.com/mcp',
    auth: { type: 'bearer', token: 'iam_token_abc' },
    clients: ['cursor', 'claude'],
  };

  const written = writeMcpServer('inneranimalmedia', config, { home });
  assert.equal(written.name, 'inneranimalmedia');
  assert.equal(written.url, 'https://mcp.inneranimalmedia.com/mcp');

  const read = readMcpServer('inneranimalmedia', { home });
  assert.equal(read.name, 'inneranimalmedia');
  assert.equal(read.auth.token, 'iam_token_abc');
  assert.deepEqual(read.clients, ['cursor', 'claude']);

  const list = listMcpServers({ home });
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'inneranimalmedia');

  const deleted = deleteMcpServer('inneranimalmedia', { home });
  assert.equal(deleted, true);
  assert.equal(readMcpServer('inneranimalmedia', { home }), null);
});

test('MCP client adapters materialize Cursor and Claude desktop configurations cleanly', () => {
  const home = tempHome();
  const serverConfig = {
    url: 'https://mcp.inneranimalmedia.com/mcp',
    auth: { type: 'bearer', token: 'oauth_cursor_123' },
  };

  // Pre-seed an existing server in Cursor config to ensure no clobbering
  const cursorConfigPath = getClientConfigPath('cursor', { home });
  fs.mkdirSync(path.dirname(cursorConfigPath), { recursive: true });
  fs.writeFileSync(
    cursorConfigPath,
    JSON.stringify({ mcpServers: { other_server: { url: 'http://localhost:8080' } } })
  );

  // Sync to Cursor
  const cursorResult = syncServerToClient('cursor', 'inneranimalmedia', serverConfig, { home });
  assert.equal(cursorResult.synced, true);

  const cursorContent = JSON.parse(fs.readFileSync(cursorConfigPath, 'utf8'));
  assert.ok(cursorContent.mcpServers.other_server, 'Preserved other server in Cursor config');
  assert.equal(cursorContent.mcpServers.inneranimalmedia.url, 'https://mcp.inneranimalmedia.com/mcp');
  assert.equal(cursorContent.mcpServers.inneranimalmedia.headers.Authorization, 'Bearer oauth_cursor_123');
  assert.equal(cursorContent.mcpServers.inneranimalmedia.headers.Accept, 'application/json, text/event-stream');

  // Inspect adapter
  const inspection = inspectClientAdapter('cursor', 'inneranimalmedia', { home });
  assert.equal(inspection.configured, true);
  assert.equal(inspection.present, true);

  // Sync to Claude
  const claudeResult = syncServerToClient('claude', 'inneranimalmedia', serverConfig, { home });
  assert.equal(claudeResult.synced, true);
  const claudeConfigPath = getClientConfigPath('claude', { home });
  const claudeContent = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
  assert.equal(claudeContent.mcpServers.inneranimalmedia.url, 'https://mcp.inneranimalmedia.com/mcp');

  // Remove from Cursor
  const removeResult = removeServerFromClient('cursor', 'inneranimalmedia', { home });
  assert.equal(removeResult.removed, true);
  const postRemove = JSON.parse(fs.readFileSync(cursorConfigPath, 'utf8'));
  assert.equal(postRemove.mcpServers.inneranimalmedia, undefined);
  assert.ok(postRemove.mcpServers.other_server, 'Still preserved other server');
});

test('MCP telemetry logs tool receipts and computes accurate summaries', () => {
  const home = tempHome();

  recordToolReceipt({ tool_key: 'github_read', source_client: 'cursor', duration_ms: 120 }, { home });
  recordToolReceipt({ tool_key: 'mcp:d1_query', source_client: 'cursor_mcp', duration_ms: 45 }, { home });
  recordToolReceipt({ tool_key: 'terminal_exec', source_client: 'agentsam', duration_ms: 800 }, { home });
  recordToolReceipt({ tool_key: 'mcp:tool_broken', error_code: 'TIMEOUT', duration_ms: 5000 }, { home });

  const receipts = getSessionToolReceipts({ home });
  assert.equal(receipts.length, 4);

  const summary = summarizeToolReceipts(receipts);
  assert.equal(summary.tool_call_count, 4);
  assert.equal(summary.mcp_call_count, 2);
  assert.equal(summary.github_call_count, 1);
  assert.equal(summary.d1_call_count, 1);
  assert.equal(summary.terminal_call_count, 1);
  assert.equal(summary.failure_count, 1);
  assert.equal(summary.success_count, 3);
});

test('agentsam mcp CLI handles add, list, status, doctor, and remove end-to-end', async () => {
  const home = tempHome();
  const logs = [];
  const write = (str) => logs.push(str);

  // Add inneranimalmedia preset
  const addRes = await runMcp(
    ['add', 'inneranimalmedia', '--client', 'cursor', '--token', 'test_tok_777', '--json'],
    { home, write }
  );
  assert.equal(addRes.ok, true);
  assert.equal(addRes.server.name, 'inneranimalmedia');
  assert.equal(addRes.server.auth.token, 'test_tok_777');

  // List
  const listRes = await runMcp(['list', '--json'], { home, write });
  assert.equal(listRes.length, 1);
  assert.equal(listRes[0].name, 'inneranimalmedia');

  // Status
  const statusRes = await runMcp(['status', 'inneranimalmedia', '--json'], { home, write });
  assert.equal(statusRes.name, 'inneranimalmedia');
  assert.equal(statusRes.hasAuth, true);
  assert.equal(statusRes.clients[0].configured, true);

  // Doctor
  const doctorRes = await runMcp(['doctor', 'inneranimalmedia', '--json'], { home, write });
  assert.equal(doctorRes.name, 'inneranimalmedia');
  assert.equal(doctorRes.authConfigured, true);

  // Remove
  const removeRes = await runMcp(['remove', 'inneranimalmedia', '--client', 'all', '--json'], { home, write });
  assert.equal(removeRes.deletedAuthority, true);

  const emptyList = await runMcp(['list', '--json'], { home, write });
  assert.equal(emptyList.length, 0);
});
