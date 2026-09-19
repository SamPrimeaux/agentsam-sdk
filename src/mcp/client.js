import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function buildHeaders(serverConfig = {}) {
  const headers = {
    'Accept': 'application/json, text/event-stream',
    'User-Agent': 'AgentSam-SDK/2.6.2 (MCP Client)',
  };
  const token = clean(serverConfig.auth?.token);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function pingMcpServer(serverConfig = {}, options = {}) {
  const url = clean(serverConfig.url);
  if (!url) throw new Error('missing_mcp_server_url');

  const startMs = Date.now();
  const headers = buildHeaders(serverConfig);
  const timeoutMs = options.timeoutMs || 5000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // First attempt an HTTP OPTIONS or GET / health ping
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    }).catch(async () => {
      // If GET returns 405/404, try POST with JSON-RPC ping
      return await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
        signal: controller.signal,
      });
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - startMs;

    return {
      ok: res.status < 500,
      status: res.status,
      statusText: res.statusText,
      latencyMs,
      url,
    };
  } catch (err) {
    return {
      ok: false,
      error: err.name === 'AbortError' ? 'timeout' : err.message,
      latencyMs: Date.now() - startMs,
      url,
    };
  }
}

export async function listMcpTools(serverConfig = {}, options = {}) {
  const url = clean(serverConfig.url);
  if (!url) throw new Error('missing_mcp_server_url');

  const headers = buildHeaders(serverConfig);

  // Try standard JSON-RPC tools/list via POST first (fastest across Cloudflare Workers)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'tools-list-1',
        method: 'tools/list',
        params: {},
      }),
      signal: AbortSignal.timeout(options.timeoutMs || 8000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.result?.tools && Array.isArray(data.result.tools)) {
        return {
          tools: data.result.tools,
          count: data.result.tools.length,
          transport: 'http_jsonrpc',
        };
      }
    }
  } catch {
    // Fall back to SSE transport below
  }

  // Fallback to SSE transport via @modelcontextprotocol/sdk
  try {
    const transport = new SSEClientTransport(new URL(url), {
      requestInit: { headers },
    });
    const client = new Client({ name: 'agentsam-sdk', version: '2.6.2' }, { capabilities: {} });
    await client.connect(transport);
    const toolsResult = await client.listTools();
    await transport.close();

    return {
      tools: toolsResult.tools || [],
      count: toolsResult.tools?.length || 0,
      transport: 'sse_sdk',
    };
  } catch (err) {
    return {
      tools: [],
      count: 0,
      error: err.message,
    };
  }
}

export async function callMcpTool(serverConfig = {}, toolName, args = {}, options = {}) {
  const url = clean(serverConfig.url);
  if (!url) throw new Error('missing_mcp_server_url');

  const startMs = Date.now();
  const headers = buildHeaders(serverConfig);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `call-${Date.now()}`,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      }),
      signal: AbortSignal.timeout(options.timeoutMs || 30000),
    });

    const latencyMs = Date.now() - startMs;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `HTTP ${res.status}: ${res.statusText}`,
        latencyMs,
      };
    }

    const data = await res.json();
    return {
      ok: !data.error && !data.result?.isError,
      result: data.result,
      error: data.error?.message || (data.result?.isError ? JSON.stringify(data.result.content) : null),
      latencyMs,
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      latencyMs: Date.now() - startMs,
    };
  }
}
