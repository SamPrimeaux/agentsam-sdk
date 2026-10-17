import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMcp } from '../../src/commands/mcp.js';
import { createMcpD1Bridge } from '../../src/capabilities/mcp-d1-bridge.js';
import { createCapabilityAdapter } from '../../src/agent/capability-adapter.js';
import { readMcpServer, writeMcpServer } from '../../src/mcp/authority.js';
import { buildNativeAuthorizationUrl } from '../../src/lib/auth.js';
import {
  IAM_MCP_RESOURCE, IAM_MCP_SCOPE, mcpConnectionStatus, resolveMcpResourceServer,
} from '../../src/mcp/oauth-connection.js';

const makeHome = t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-mcp-resource-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
};

test('native IAM PKCE supports resource binding without changing the default CLI scope', () => {
  const base = { issuer: 'https://inneranimalmedia.com', redirectUri: 'http://127.0.0.1:8181/callback', state: 'state', codeChallenge: 'challenge' };
  const normal = new URL(buildNativeAuthorizationUrl(base));
  assert.equal(normal.searchParams.has('resource'), false);
  const mcp = new URL(buildNativeAuthorizationUrl({ ...base, scope: IAM_MCP_SCOPE, resource: IAM_MCP_RESOURCE }));
  assert.equal(mcp.searchParams.get('resource'), IAM_MCP_RESOURCE);
  assert.ok(mcp.searchParams.get('scope').includes('mcp:tools'));
});

test('MCP connect uses existing IAM PKCE without replacing CLI account session or exposing tokens', async t => {
  const home = makeHome(t), output = [];
  const userAuth = path.join(home, '.agentsam', 'auth', 'session.json');
  fs.mkdirSync(path.dirname(userAuth), { recursive: true });
  fs.writeFileSync(userAuth, '{"original":"CLI login preserved"}');
  const calls = [];
  const result = await runMcp(['connect', 'inneranimalmedia', '--json'], {
    home, write: line => output.push(line),
    authenticateImpl: async options => {
      calls.push(options);
      return {
        access_token: 'secret-mcp-access',
        refresh_token: 'secret-mcp-refresh',
        expires_in: 1200,
        client_id: 'iam_cli_agentsam',
        scope: IAM_MCP_SCOPE,
        audience: IAM_MCP_RESOURCE,
      };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0].saveSession, false);
  assert.equal(calls[0].resource, IAM_MCP_RESOURCE);
  assert.equal(calls[0].scope, IAM_MCP_SCOPE);
  assert.equal(fs.readFileSync(userAuth, 'utf8'), '{"original":"CLI login preserved"}');
  const stored = readMcpServer('inneranimalmedia', { home });
  assert.equal(stored.auth.token, 'secret-mcp-access');
  assert.equal(stored.auth.resource, IAM_MCP_RESOURCE);
  assert.equal(stored.auth.refresh_token, 'secret-mcp-refresh');
  assert.equal(createMcpD1Bridge({ home }).available, true);
  assert.doesNotMatch(output.join(''), /secret-mcp-(access|refresh)/);
  const list = [];
  await runMcp(['list', '--json'], { home, write: line => list.push(line) });
  assert.doesNotMatch(list.join(''), /secret-mcp-(access|refresh)/);
  assert.equal(JSON.parse(list.join('')).servers[0].auth.configured, true);
});

test('rejects wrong audience and missing MCP scope without persisting credentials', async t => {
  const home = makeHome(t);
  for (const grant of [
    { access_token: 'wrong-audience', scope: IAM_MCP_SCOPE, audience: 'https://other.example/mcp' },
    { access_token: 'missing-scope', scope: 'openid', audience: IAM_MCP_RESOURCE },
  ]) {
    await assert.rejects(runMcp(['connect'], {
      home, write: () => {},
      authenticateImpl: async () => grant,
    }), /mcp_oauth_(wrong_audience|scope_not_granted)/);
    assert.equal(readMcpServer('inneranimalmedia', { home }), null);
  }
});

test('refreshes expired MCP token on actual call, preserves server IAM scope and writes rotated grant', async t => {
  const home = makeHome(t);
  const cfg = { home };
  writeMcpServer('inneranimalmedia', {
    url: IAM_MCP_RESOURCE, clients: ['agentsam'],
    auth: {
      type: 'oauth', token: 'old-token', refresh_token: 'old-refresh',
      scope: IAM_MCP_SCOPE, resource: IAM_MCP_RESOURCE, client_id: 'iam_cli_agentsam',
      expires_at: new Date(Date.now() - 300000).toISOString(),
    },
  }, cfg);
  const server = await resolveMcpResourceServer({
    home, refresh: async input => {
      assert.equal(input.resource, IAM_MCP_RESOURCE);
      assert.equal(input.session.refresh_token, 'old-refresh');
      return { access_token: 'new-token', refresh_token: 'rotated-refresh', expires_in: 3600 };
    },
  });
  assert.equal(server.auth.token, 'new-token');
  assert.equal(readMcpServer('inneranimalmedia', cfg).auth.refresh_token, 'rotated-refresh');
  assert.equal(server.auth.resource, IAM_MCP_RESOURCE);
  assert.equal(mcpConnectionStatus(server).available, true);
});

test('valid MCP grant binds D1; live discovery and connection status remain truthful', async t => {
  const home = makeHome(t);
  writeMcpServer('inneranimalmedia', { url: IAM_MCP_RESOURCE,
    auth: { type:'oauth', token:'fixture', refresh_token:'refresh', client_id:'iam_cli_agentsam',
      scope:IAM_MCP_SCOPE, resource:IAM_MCP_RESOURCE, expires_at:new Date(Date.now() + 3600000).toISOString() },
    clients:['agentsam'],
  }, { home });
  const bridge = createMcpD1Bridge({ home, callTool: async (server, name, args) => {
    assert.equal(server.auth.token, 'fixture');
    assert.equal(name, 'agentsam_cf_d1_list');
    assert.deepEqual(args, {});
    return { content: [{ type: 'text', text: '{"ok":true,"result":[{"name":"fuelnfreetime"}]}' }] };
  } });
  const adapter = createCapabilityAdapter({ projectRoot: process.cwd(), mcpD1Bridge: bridge });
  const dbStatus = (await adapter.invoke('capability.status', { id: 'agentsam_cf_d1_list' })).result;
  assert.equal(dbStatus.agent_callable, true);
  assert.equal(dbStatus.readiness, 'unverified', 'connection is not live-probed yet');
  const writeStatus = (await adapter.invoke('capability.status', { id:'agentsam_d1_write' })).result;
  assert.equal(writeStatus.agent_callable, false);
  assert.equal(writeStatus.reason, 'mcp_d1_write_scope_missing');
  const invoked = await adapter.invoke('agentsam_cf_d1_list', {});
  assert.equal(invoked.result.result[0].name, 'fuelnfreetime');
  const status = (await adapter.invoke('capability.status', { id: 'capability.invoke' })).result;
  assert.equal(status.agent_callable, true, 'registration after registry creation must be visible');
  assert.equal(status.readiness, 'available');
});

test('explicit --write consent requests the agent scope without changing read-only defaults', async t => {
  const home = makeHome(t), calls = [];
  await runMcp(['connect', 'inneranimalmedia', '--write', '--json'], {
    home, write: () => {},
    authenticateImpl: async input => {
      calls.push(input);
      return { access_token:'consented', scope:input.scope, client_id:'iam_cli_agentsam', audience:IAM_MCP_RESOURCE, expires_in:3600 };
    },
  });
  assert.match(calls[0].scope, /iam:agent/);
  const bridge=createMcpD1Bridge({home});
  assert.ok(bridge.allowedTools.includes('agentsam_d1_write'));
  const adapter=createCapabilityAdapter({projectRoot:process.cwd(),mcpD1Bridge:bridge});
  assert.equal(adapter.canInvoke('agentsam_d1_write'),true);
});

test('unconnected and invalid MCP OAuth grants are not advertised as callable', async t => {
  const home = makeHome(t);
  const absent = createMcpD1Bridge({ home });
  assert.equal(absent.available, false);
  assert.equal(absent.next, 'agentsam mcp connect inneranimalmedia');
  writeMcpServer('inneranimalmedia', { url: IAM_MCP_RESOURCE, clients:['agentsam'],
    auth: { type:'oauth', token:'invalid', scope:'openid', resource:IAM_MCP_RESOURCE } }, { home });
  assert.equal(createMcpD1Bridge({ home }).reason, 'mcp_d1_oauth_scope_missing');
  writeMcpServer('inneranimalmedia', { url: IAM_MCP_RESOURCE, clients:['agentsam'],
    auth: { type:'oauth', token:'invalid', scope:IAM_MCP_SCOPE, resource:'https://other.example/mcp' } }, { home });
  assert.equal(createMcpD1Bridge({ home }).reason, 'mcp_d1_oauth_wrong_audience');
});
