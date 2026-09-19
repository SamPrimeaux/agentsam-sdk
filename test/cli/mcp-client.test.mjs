import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  MCP_PRESETS,
  deleteMcpServer,
  fetchExternalClientRegistry,
  fetchMcpServerCatalog,
  getClientConfigPath,
  getClientRegistryCachePath,
  getServerCatalogCachePath,
  getSessionToolReceipts,
  inspectClientAdapter,
  isClientRegistered,
  listKnownServers,
  listMcpServers,
  listRegisteredClients,
  readMcpServer,
  recordToolReceipt,
  removeServerFromClient,
  resolveServerPreset,
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

test('MCP external client registry recognizes chatgpt, claude, cursor and respects is_active', async () => {
  const home = tempHome();

  // Baseline seed / cached client list
  const clients = listRegisteredClients({ home });
  const keys = clients.map((c) => c.client_key);
  assert.ok(keys.includes('chatgpt'), 'ChatGPT is recognized in the external client registry');
  assert.ok(keys.includes('cursor'), 'Cursor is recognized in the external client registry');
  assert.ok(keys.includes('claude'), 'Claude is recognized in the external client registry');
  assert.ok(keys.includes('agentsam'), 'AgentSam is recognized in the external client registry');

  assert.equal(isClientRegistered('chatgpt', { home }), true);
  assert.equal(isClientRegistered('cursor', { home }), true);
  assert.equal(isClientRegistered('nonexistent_client_xyz', { home }), false);

  // Cache path is created upon writing
  const cachePath = getClientRegistryCachePath({ home });
  assert.equal(cachePath.endsWith('client-registry-cache.json'), true);
});

test('MCP client adapters materialize Cursor, Claude, and ChatGPT configurations cleanly', () => {
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

  // Inspect Cursor adapter
  const inspection = inspectClientAdapter('cursor', 'inneranimalmedia', { home });
  assert.equal(inspection.configured, true);
  assert.equal(inspection.present, true);

  // Sync to Claude
  const claudeResult = syncServerToClient('claude', 'inneranimalmedia', serverConfig, { home });
  assert.equal(claudeResult.synced, true);
  const claudeConfigPath = getClientConfigPath('claude', { home });
  const claudeContent = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
  assert.equal(claudeContent.mcpServers.inneranimalmedia.url, 'https://mcp.inneranimalmedia.com/mcp');

  // Sync to ChatGPT
  const chatgptResult = syncServerToClient('chatgpt', 'inneranimalmedia', serverConfig, { home });
  assert.equal(chatgptResult.synced, true);
  const chatgptConfigPath = getClientConfigPath('chatgpt', { home });
  assert.ok(fs.existsSync(chatgptConfigPath));
  const chatgptContent = JSON.parse(fs.readFileSync(chatgptConfigPath, 'utf8'));
  assert.equal(chatgptContent.name, 'inneranimalmedia');
  assert.equal(chatgptContent.server_url, 'https://mcp.inneranimalmedia.com/mcp');
  assert.equal(chatgptContent.schema, 'agentsam.mcp.client-adapter.chatgpt.v1');

  // Remove from Cursor
  const removeResult = removeServerFromClient('cursor', 'inneranimalmedia', { home });
  assert.equal(removeResult.removed, true);
  const postRemove = JSON.parse(fs.readFileSync(cursorConfigPath, 'utf8'));
  assert.equal(postRemove.mcpServers.inneranimalmedia, undefined);
  assert.ok(postRemove.mcpServers.other_server, 'Still preserved other server');

  // Remove from ChatGPT
  const removeChatgpt = removeServerFromClient('chatgpt', 'inneranimalmedia', { home });
  assert.equal(removeChatgpt.removed, true);
  assert.equal(fs.existsSync(chatgptConfigPath), false);
});

test('MCP server catalog resolves real registered servers with live health metrics', () => {
  const home = tempHome();
  const catalog = listKnownServers({ home });
  assert.ok(catalog.length >= 8);

  // Cloudflare API server from D1
  const cfApi = resolveServerPreset('cloudflare-api', { home });
  assert.ok(cfApi);
  assert.equal(cfApi.url, 'https://mcp.cloudflare.com/mcp');
  assert.equal(cfApi.health_status, 'degraded');
  assert.equal(cfApi.avg_latency_ms, 9);

  // InnerAnimalMedia Main MCP from D1
  const iam = resolveServerPreset('inneranimalmedia', { home });
  assert.ok(iam);
  assert.equal(iam.health_status, 'healthy');
  assert.equal(iam.avg_latency_ms, 443);
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

  // Test --help output surfaces chatgpt and known catalog servers
  await runMcp(['--help'], { home, write });
  const helpText = logs.join('\n');
  assert.ok(helpText.includes('chatgpt'), 'Help text displays ChatGPT as a recognized client');
  assert.ok(helpText.includes('cloudflare-api'), 'Help text displays cloudflare-api preset');
  logs.length = 0;

  // Add inneranimalmedia preset for chatgpt client
  const addRes = await runMcp(
    ['add', 'inneranimalmedia', '--client', 'chatgpt', '--token', 'test_tok_777', '--json'],
    { home, write }
  );
  assert.equal(addRes.ok, true);
  assert.equal(addRes.server.name, 'inneranimalmedia');
  assert.equal(addRes.server.auth.token, 'test_tok_777');
  assert.equal(addRes.syncedAdapters[0].client, 'chatgpt');

  // List
  const listRes = await runMcp(['list', '--json'], { home, write });
  assert.equal(listRes.length, 1);
  assert.equal(listRes[0].name, 'inneranimalmedia');

  // List catalog
  const catalogRes = await runMcp(['list', '--catalog', '--json'], { home, write });
  assert.ok(catalogRes.length >= 8);

  // Status
  const statusRes = await runMcp(['status', 'inneranimalmedia', '--json'], { home, write });
  assert.equal(statusRes.name, 'inneranimalmedia');
  assert.equal(statusRes.hasAuth, true);

  // Doctor includes catalog health data
  const doctorRes = await runMcp(['doctor', 'inneranimalmedia', '--json'], { home, write });
  assert.equal(doctorRes.name, 'inneranimalmedia');
  assert.equal(doctorRes.authConfigured, true);
  assert.equal(doctorRes.catalogHealth?.health_status, 'healthy');

  // Remove
  const removeRes = await runMcp(['remove', 'inneranimalmedia', '--client', 'all', '--json'], { home, write });
  assert.equal(removeRes.deletedAuthority, true);

  const emptyList = await runMcp(['list', '--json'], { home, write });
  assert.equal(emptyList.length, 0);
});
