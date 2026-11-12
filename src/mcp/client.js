/**
 * MCP JSON-RPC client for AgentSam CLI (ping / tools/list / tools/call).
 *
 * Prefers Streamable HTTP (current MCP remote transport), falls back to SSE.
 * Does not invent connection presets — callers pass a concrete serverConfig.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { assertApprovedBrowserMcpStdio } from './browsermcp.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PKG_VERSION = (() => {
  try {
    return require('../../package.json').version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function buildHeaders(serverConfig = {}) {
  const headers = {
    Accept: 'application/json, text/event-stream',
    'User-Agent': `AgentSam-SDK/${PKG_VERSION} (MCP Client)`,
  };
  const token = clean(serverConfig.auth?.token);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * @template T
 * @param {object} serverConfig
 * @param {(client: import('@modelcontextprotocol/sdk/client/index.js').Client, transport: string) => Promise<T>} fn
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: true, value: T, transport: string } | { ok: false, error: string, transport?: string }>}
 */
export async function withMcpClient(serverConfig, fn, options = {}) {
  const isStdio = serverConfig?.protocol === 'stdio';
  // No remote manifest or D1 value may cause an arbitrary local process spawn.
  if (isStdio) {
    try { assertApprovedBrowserMcpStdio(serverConfig); }
    catch (error) { return { ok: false, error: error.message, transport: 'stdio' }; }
  }
  const url = clean(serverConfig.url);
  if (!isStdio && !url) return { ok: false, error: 'missing_mcp_server_url' };

  const headers = buildHeaders(serverConfig);
  const requestInit = { headers };
  const errors = [];

  const tryTransport = async (label, createTransport) => {
    const transport = createTransport();
    const client = new Client(
      { name: 'agentsam-sdk', version: PKG_VERSION },
      { capabilities: {} },
    );
    const timer = setTimeout(() => {
      try { transport.close?.(); } catch { /* ignore */ }
    }, options.timeoutMs || 15000);
    try {
      await client.connect(transport);
      const value = await fn(client, label);
      return { ok: true, value, transport: label };
    } finally {
      clearTimeout(timer);
      try { await transport.close?.(); } catch { /* ignore */ }
    }
  };

  if (isStdio) {
    try {
      return await tryTransport('stdio', () =>
        options.createStdioTransport?.(serverConfig) ?? new StdioClientTransport({
          command: serverConfig.command,
          args: serverConfig.args,
          stderr: 'pipe',
        }),
      );
    } catch (error) {
      return { ok: false, transport: 'stdio', error: `stdio:${error?.message || error}` };
    }
  }

  try {
    return await tryTransport(
      'streamable_http',
      () => new StreamableHTTPClientTransport(new URL(url), { requestInit }),
    );
  } catch (err) {
    errors.push(`streamable_http:${err?.message || err}`);
  }

  try {
    return await tryTransport(
      'sse',
      () => new SSEClientTransport(new URL(url), { requestInit }),
    );
  } catch (err) {
    errors.push(`sse:${err?.message || err}`);
  }

  return { ok: false, error: errors.join(' | ') || 'mcp_connect_failed' };
}

export async function pingMcpServer(serverConfig = {}, options = {}) {
  const isStdio = serverConfig.protocol === 'stdio';
  const url = clean(serverConfig.url);
  if (!isStdio && !url) throw new Error('missing_mcp_server_url');

  const startMs = Date.now();
  const connected = await withMcpClient(
    serverConfig,
    async (client) => {
      // listTools is a cheap post-initialize probe across CF portals
      const tools = await client.listTools().catch(() => ({ tools: [] }));
      return { toolCount: tools?.tools?.length ?? 0 };
    },
    { timeoutMs: options.timeoutMs || 8000, createStdioTransport: options.createStdioTransport },
  );

  const latencyMs = Date.now() - startMs;
  if (connected.ok) {
    return {
      ok: true,
      status: 200,
      statusText: isStdio ? 'mcp_server_initialized' : 'connected',
      // Browser extension approval is a separate user-controlled step.
      ...(isStdio ? { pairingStatus: 'unverified', next: 'Compare the six-digit code in the Browser MCP extension and click Allow.' } : {}),
      latencyMs,
      url,
      transport: connected.transport,
      toolCount: connected.value?.toolCount ?? null,
    };
  }

  if (isStdio) return { ok: false, error: connected.error, transport: 'stdio', pairingStatus: 'unverified', latencyMs };

  // Last-resort HTTP reachability (does not prove MCP session)
  try {
    const headers = buildHeaders(serverConfig);
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      signal: AbortSignal.timeout(options.timeoutMs || 5000),
    });
    return {
      // A 401/403 only proves HTTP reachability, never an authorized MCP session.
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      latencyMs: Date.now() - startMs,
      url,
      transport: 'http_jsonrpc_ping',
      warning: connected.error,
    };
  } catch (err) {
    return {
      ok: false,
      error: connected.error || (err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timeout' : err.message),
      latencyMs: Date.now() - startMs,
      url,
    };
  }
}

export async function listMcpTools(serverConfig = {}, options = {}) {
  const connected = await withMcpClient(
    serverConfig,
    async (client) => client.listTools(),
    { timeoutMs: options.timeoutMs || 12000, createStdioTransport: options.createStdioTransport },
  );

  if (connected.ok) {
    const tools = connected.value?.tools || [];
    return {
      tools,
      count: tools.length,
      transport: connected.transport,
    };
  }

  return {
    tools: [],
    count: 0,
    error: connected.error,
  };
}

export async function callMcpTool(serverConfig = {}, toolName, args = {}, options = {}) {
  const startMs = Date.now();
  const connected = await withMcpClient(
    serverConfig,
    async (client) => client.callTool({ name: toolName, arguments: args }),
    { timeoutMs: options.timeoutMs || 30000, createStdioTransport: options.createStdioTransport },
  );

  const latencyMs = Date.now() - startMs;
  if (!connected.ok) {
    return { ok: false, error: connected.error, latencyMs };
  }

  const result = connected.value;
  return {
    ok: !result?.isError,
    result,
    error: result?.isError ? JSON.stringify(result.content) : null,
    latencyMs,
    transport: connected.transport,
  };
}
