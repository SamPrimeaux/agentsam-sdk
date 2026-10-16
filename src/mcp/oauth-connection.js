/**
 * MCP resource authority for AgentSam's existing IAM OAuth client.
 * This does not replace the user account session, MCP transport, or server
 * grant policy. The MCP bearer must be scoped to this resource.
 */
import { readMcpServer, writeMcpServer } from './authority.js';
import { refreshNativeOAuthToken } from '../lib/auth.js';

export const IAM_MCP_RESOURCE = 'https://mcp.inneranimalmedia.com/mcp';
export const IAM_MCP_SCOPE = 'openid profile email offline_access iam:profile iam:workspaces mcp:tools mcp:userinfo';
export const IAM_MCP_SERVER = 'inneranimalmedia';

export class McpResourceError extends Error {
  constructor(code, next = 'agentsam mcp connect inneranimalmedia') {
    super(code);
    this.name = 'McpResourceError';
    this.code = code;
    this.next = next;
  }
}

const clean = value => String(value || '').trim();

export function mcpConnectionStatus(server, { nowMs = Date.now() } = {}) {
  const next = 'agentsam mcp connect inneranimalmedia';
  if (!server) return { available: false, reason: 'mcp_d1_connection_not_configured', next };
  if (clean(server.name) !== IAM_MCP_SERVER || server.url !== IAM_MCP_RESOURCE) {
    return { available: false, reason: 'mcp_d1_server_mismatch', next };
  }
  const auth = server.auth;
  if (!clean(auth?.token)) return { available: false, reason: 'mcp_d1_oauth_not_connected', next };
  if (auth.type === 'oauth') {
    if (auth.resource !== IAM_MCP_RESOURCE) {
      return { available: false, reason: 'mcp_d1_oauth_wrong_audience', next };
    }
    if (!clean(auth.scope).split(/\s+/).includes('mcp:tools')) {
      return { available: false, reason: 'mcp_d1_oauth_scope_missing', next };
    }
  }
  const expiry = Date.parse(auth.expires_at || '');
  if (Number.isFinite(expiry) && expiry <= nowMs + 60_000 && !auth.refresh_token) {
    return { available: false, reason: 'mcp_d1_oauth_session_expired', next };
  }
  return { available: true, readiness: 'unverified', reason: 'mcp_d1_connection_not_probed', next: 'agentsam mcp doctor inneranimalmedia --json' };
}

export function describeMcpServer(server, options = {}) {
  const state = mcpConnectionStatus(server, options);
  return {
    name: server?.name || IAM_MCP_SERVER,
    url: server?.url || IAM_MCP_RESOURCE,
    configured: Boolean(server),
    authenticated: Boolean(server?.auth?.token),
    refreshable: Boolean(server?.auth?.refresh_token),
    expires_at: server?.auth?.expires_at || null,
    ...state,
  };
}

/** Resolve a bearer immediately before network execution, refreshing the
 * existing separately stored MCP grant without leaking credentials to a model.
 */
export async function resolveMcpResourceServer({
  home, refresh = refreshNativeOAuthToken, nowMs = Date.now(),
} = {}) {
  let server = readMcpServer(IAM_MCP_SERVER, home ? { home } : {});
  const initial = mcpConnectionStatus(server, { nowMs });
  if (!initial.available) {
    const error = new Error(initial.reason);
    error.code = initial.reason;
    error.next = initial.next;
    throw error;
  }
  const auth = server.auth;
  const expiry = Date.parse(auth.expires_at || '');
  if (auth.type === 'oauth' && Number.isFinite(expiry) && expiry <= nowMs + 60_000) {
    let tokenSet;
    try {
      tokenSet = await refresh({
        home, session: {
          client_id: auth.client_id,
          refresh_token: auth.refresh_token,
        },
        resource: IAM_MCP_RESOURCE,
      });
    } catch {
      const error = new Error('mcp_d1_oauth_refresh_failed');
      error.code = 'mcp_d1_oauth_refresh_failed';
      error.next = 'agentsam mcp connect inneranimalmedia';
      throw error;
    }
    const accessToken = clean(tokenSet?.access_token);
    if (!accessToken) throw new Error('mcp_d1_oauth_refresh_missing_token');
    const expiryMs = Number(tokenSet.expires_in) * 1000;
    server = writeMcpServer(IAM_MCP_SERVER, {
      ...server,
      auth: {
        ...auth, token: accessToken,
        refresh_token: clean(tokenSet.refresh_token) || auth.refresh_token,
        expires_at: Number.isFinite(expiryMs) && expiryMs > 0 ? new Date(nowMs + expiryMs).toISOString() : null,
      },
    }, home ? { home } : {});
  }
  return server;
}
