import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getMcpDir, homeDirectory } from './authority.js';

export const DEFAULT_CLIENT_REGISTRY_URL = 'https://mcp.inneranimalmedia.com/api/mcp/clients';
export const CLIENT_REGISTRY_CACHE_SCHEMA = 'agentsam.mcp.client-registry.v1';

/**
 * Seed external MCP client registry snapshot derived directly from D1 table:
 * `agentsam_mcp_oauth_external_client_registry`.
 *
 * This acts as the baseline cache for offline or pre-fetch execution,
 * respecting `is_active` and `sort_order`.
 */
export const SEED_EXTERNAL_CLIENT_REGISTRY = Object.freeze([
  {
    client_key: 'agentsam',
    display_name: 'AgentSam CLI',
    oauth_client_id: 'iam_mcp_inneranimalmedia',
    redirect_host_patterns: ['127.0.0.1', 'localhost', 'agentsam.inneranimalmedia.com'],
    sort_order: 5,
    is_active: 1,
    notes: 'AgentSam CLI native MCP client',
  },
  {
    client_key: 'chatgpt',
    display_name: 'ChatGPT',
    oauth_client_id: 'iam_mcp_inneranimalmedia',
    redirect_host_patterns: ['chatgpt.com', 'chat.openai.com'],
    sort_order: 10,
    is_active: 1,
    notes: 'OpenAI ChatGPT connector_platform_oauth + per-connector redirect',
  },
  {
    client_key: 'cf_docs_mcp',
    display_name: 'Cloudflare Docs',
    oauth_client_id: 'iam_mcp_inneranimalmedia',
    redirect_host_patterns: ['docs.mcp.cloudflare.com'],
    sort_order: 10,
    is_active: 1,
    notes: 'https://docs.mcp.cloudflare.com/mcp — CF docs reference',
  },
  {
    client_key: 'cf_bindings_mcp',
    display_name: 'Cloudflare Workers Bindings',
    oauth_client_id: 'iam_mcp_inneranimalmedia',
    redirect_host_patterns: ['bindings.mcp.cloudflare.com'],
    sort_order: 11,
    is_active: 1,
    notes: 'https://bindings.mcp.cloudflare.com/mcp — Workers storage, AI, compute',
  },
  {
    client_key: 'cf_builds_mcp',
    display_name: 'Cloudflare Workers Builds',
    oauth_client_id: 'iam_mcp_inneranimalmedia',
    redirect_host_patterns: ['builds.mcp.cloudflare.com'],
    sort_order: 12,
    is_active: 1,
    notes: 'https://builds.mcp.cloudflare.com/mcp — CI/CD insights',
  },
  {
    client_key: 'cf_observability_mcp',
    display_name: 'Cloudflare Observability',
    oauth_client_id: 'iam_mcp_inneranimalmedia',
    redirect_host_patterns: ['observability.mcp.cloudflare.com'],
    sort_order: 13,
    is_active: 1,
    notes: 'https://observability.mcp.cloudflare.com/mcp — logs and analytics',
  },
  {
    client_key: 'cf_browser_mcp',
    display_name: 'Cloudflare Browser Rendering',
    oauth_client_id: 'iam_mcp_inneranimalmedia',
    redirect_host_patterns: ['browser.mcp.cloudflare.com'],
    sort_order: 14,
    is_active: 1,
    notes: 'https://browser.mcp.cloudflare.com/mcp — fetch pages, markdown, screenshots',
  },
  {
    client_key: 'cf_logs_mcp',
    display_name: 'Cloudflare Logpush',
    oauth_client_id: 'iam_mcp_inneranimalmedia',
    redirect_host_patterns: ['logs.mcp.cloudflare.com'],
    sort_order: 15,
    is_active: 1,
    notes: 'https://logs.mcp.cloudflare.com/mcp — Logpush job health',
  },
  {
    client_key: 'cf_ai_gateway_mcp',
    display_name: 'Cloudflare AI Gateway',
    oauth_client_id: 'iam_mcp_inneranimalmedia',
    redirect_host_patterns: ['ai-gateway.mcp.cloudflare.com'],
    sort_order: 16,
    is_active: 1,
    notes: 'https://ai-gateway.mcp.cloudflare.com/mcp — AI request logs',
  },
  {
    client_key: 'cf_audit_logs_mcp',
    display_name: 'Cloudflare Audit Logs',
    oauth_client_id: 'iam_mcp_inneranimalmedia',
    redirect_host_patterns: ['auditlogs.mcp.cloudflare.com'],
    sort_order: 17,
    is_active: 1,
    notes: 'https://auditlogs.mcp.cloudflare.com/mcp — audit log reports',
  },
  {
    client_key: 'cf_dns_analytics_mcp',
    display_name: 'Cloudflare DNS Analytics',
    oauth_client_id: 'iam_mcp_inneranimalmedia',
    redirect_host_patterns: ['dns-analytics.mcp.cloudflare.com'],
    sort_order: 18,
    is_active: 1,
    notes: 'https://dns-analytics.mcp.cloudflare.com/mcp — DNS performance',
  },
  {
    client_key: 'cf_graphql_mcp',
    display_name: 'Cloudflare GraphQL',
    oauth_client_id: 'iam_mcp_inneranimalmedia',
    redirect_host_patterns: ['graphql.mcp.cloudflare.com'],
    sort_order: 19,
    is_active: 1,
    notes: 'https://graphql.mcp.cloudflare.com/mcp — analytics via GraphQL',
  },
  {
    client_key: 'cf_codemode_mcp',
    display_name: 'Cloudflare Code Mode',
    oauth_client_id: 'iam_mcp_inneranimalmedia',
    redirect_host_patterns: ['mcp.cloudflare.com'],
    sort_order: 20,
    is_active: 1,
    notes: 'https://mcp.cloudflare.com/mcp — full CF API in 2 tools, ~1000 tokens',
  },
  {
    client_key: 'claude',
    display_name: 'Claude.ai',
    oauth_client_id: 'iam_mcp_inneranimalmedia',
    redirect_host_patterns: ['claude.ai', 'claude.com'],
    sort_order: 20,
    is_active: 1,
    notes: 'Anthropic Claude.ai MCP auth_callback',
  },
  {
    client_key: 'cf_containers_mcp',
    display_name: 'Cloudflare Container Sandbox',
    oauth_client_id: 'iam_mcp_inneranimalmedia',
    redirect_host_patterns: ['containers.mcp.cloudflare.com'],
    sort_order: 21,
    is_active: 1,
    notes: 'https://containers.mcp.cloudflare.com/mcp — ephemeral ~10min sandboxed containers',
  },
  {
    client_key: 'cursor',
    display_name: 'Cursor',
    oauth_client_id: 'iam_mcp_inneranimalmedia',
    redirect_host_patterns: ['mcp.inneranimalmedia.com', 'cursor.com', 'www.cursor.com'],
    sort_order: 30,
    is_active: 1,
    notes: 'Cursor desktop (cursor://, localhost:8787) + Cursor Agents',
  },
]);

/**
 * Dynamic list of all recognized active client keys.
 */
export const SUPPORTED_CLIENTS = Object.freeze(
  SEED_EXTERNAL_CLIENT_REGISTRY.filter((c) => Number(c.is_active) !== 0).map((c) => c.client_key),
);

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function getClientRegistryCachePath(options = {}) {
  return path.join(getMcpDir(options), 'client-registry-cache.json');
}

export function loadCachedClientRegistry(options = {}) {
  try {
    const cacheFile = getClientRegistryCachePath(options);
    if (!fs.existsSync(cacheFile)) return null;
    const raw = fs.readFileSync(cacheFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.clients)) {
      return {
        schema_version: parsed.schema_version,
        fetched_at: parsed.fetched_at || null,
        clients: parsed.clients.filter((c) => Number(c.is_active) !== 0),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCachedClientRegistry(clients = [], options = {}) {
  const cacheFile = getClientRegistryCachePath(options);
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  const payload = {
    schema_version: CLIENT_REGISTRY_CACHE_SCHEMA,
    fetched_at: new Date().toISOString(),
    clients: Array.isArray(clients) ? clients : [],
  };
  fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return payload;
}

export async function fetchExternalClientRegistry(options = {}) {
  const url = options.registryUrl || DEFAULT_CLIENT_REGISTRY_URL;
  const timeoutMs = options.timeoutMs || 5000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);

    if (res.ok) {
      const body = await res.json();
      if (body?.ok && Array.isArray(body.clients)) {
        writeCachedClientRegistry(body.clients, options);
        return body.clients.filter((c) => Number(c.is_active) !== 0);
      }
    }
  } catch {
    // Network failure / timeout — fall through to cache
  }

  const cached = loadCachedClientRegistry(options);
  if (cached?.clients?.length) {
    return cached.clients;
  }

  return SEED_EXTERNAL_CLIENT_REGISTRY.filter((c) => Number(c.is_active) !== 0);
}

export function listRegisteredClients(options = {}) {
  const cached = loadCachedClientRegistry(options);
  if (cached?.clients?.length) {
    return cached.clients;
  }
  return SEED_EXTERNAL_CLIENT_REGISTRY.filter((c) => Number(c.is_active) !== 0);
}

export function isClientRegistered(clientName, options = {}) {
  const client = clean(clientName).toLowerCase();
  if (!client) return false;
  const list = listRegisteredClients(options);
  return list.some((c) => c.client_key.toLowerCase() === client && Number(c.is_active) !== 0);
}

export function getClientConfigPath(clientName, options = {}) {
  const home = homeDirectory(options);
  const client = clean(clientName).toLowerCase();

  if (client === 'cursor') {
    return path.join(home, '.cursor', 'mcp.json');
  }

  if (client === 'claude') {
    if (process.platform === 'darwin') {
      return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    }
    if (process.platform === 'win32') {
      const appData = options.env?.APPDATA || path.join(home, 'AppData', 'Roaming');
      return path.join(appData, 'Claude', 'claude_desktop_config.json');
    }
    return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
  }

  if (client === 'chatgpt') {
    return path.join(getMcpDir(options), 'clients', 'chatgpt-connector.json');
  }

  // AgentSam apps/ family and standalone binary adapter
  if (client === 'agentsam') {
    return path.join(home, '.agentsam', 'mcp.json');
  }

  // Any other active client in registry: adapter configuration JSON
  if (isClientRegistered(client, options)) {
    return path.join(getMcpDir(options), 'clients', `${client}.json`);
  }

  throw new Error(`unsupported_mcp_client:${clientName}`);
}

export function detectInstalledClients(options = {}) {
  const detected = [];
  const home = homeDirectory(options);

  // Check Cursor
  const cursorDir = path.join(home, '.cursor');
  if (fs.existsSync(cursorDir)) {
    detected.push('cursor');
  }

  // Check Claude
  const claudeConfig = getClientConfigPath('claude', options);
  if (fs.existsSync(path.dirname(claudeConfig))) {
    detected.push('claude');
  }

  // Check ChatGPT
  const chatgptConfig = getClientConfigPath('chatgpt', options);
  if (fs.existsSync(chatgptConfig)) {
    detected.push('chatgpt');
  }

  // Check AgentSam family adapter target (~/.agentsam)
  const agentsamDir = path.join(home, '.agentsam');
  if (fs.existsSync(agentsamDir)) {
    detected.push('agentsam');
  }

  return detected;
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function syncServerToClient(clientName, serverName, serverConfig, options = {}) {
  const configPath = getClientConfigPath(clientName, options);
  const client = clean(clientName).toLowerCase();

  // ChatGPT connector payload export
  if (client === 'chatgpt') {
    const chatgptPayload = {
      schema: 'agentsam.mcp.client-adapter.chatgpt.v1',
      name: serverName,
      server_url: serverConfig.url,
      protocol: serverConfig.protocol || 'sse',
      auth: serverConfig.auth || { type: 'none' },
      description: serverConfig.metadata?.description || `MCP Server connection for ${serverName}`,
      instructions: 'Use in ChatGPT Custom GPTs or ChatGPT Developer Mode Action Connectors.',
      updated_at: new Date().toISOString(),
    };
    writeJsonAtomic(configPath, chatgptPayload);
    return { client, configPath, synced: true };
  }

  // Default Cursor / Claude mcpServers schema
  const existing = readJsonSafe(configPath) || { mcpServers: {} };
  if (!existing.mcpServers || typeof existing.mcpServers !== 'object') {
    existing.mcpServers = {};
  }

  const headers = {};
  if (serverConfig.auth?.token) {
    headers['Authorization'] = `Bearer ${serverConfig.auth.token}`;
  }
  if (client === 'cursor') {
    headers['Accept'] = 'application/json, text/event-stream';
  }

  existing.mcpServers[serverName] = {
    url: serverConfig.url,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };

  writeJsonAtomic(configPath, existing);
  return { client, configPath, synced: true };
}

export function removeServerFromClient(clientName, serverName, options = {}) {
  const configPath = getClientConfigPath(clientName, options);
  const client = clean(clientName).toLowerCase();

  if (client === 'chatgpt') {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      return { client: clientName, configPath, removed: true };
    }
    return { client: clientName, configPath, removed: false };
  }

  const existing = readJsonSafe(configPath);
  if (!existing || !existing.mcpServers || !existing.mcpServers[serverName]) {
    return { client: clientName, configPath, removed: false };
  }

  delete existing.mcpServers[serverName];
  writeJsonAtomic(configPath, existing);
  return { client: clientName, configPath, removed: true };
}

export function inspectClientAdapter(clientName, serverName, options = {}) {
  const configPath = getClientConfigPath(clientName, options);
  const exists = fs.existsSync(configPath);
  const client = clean(clientName).toLowerCase();

  if (!exists) {
    return { client: clientName, path: configPath, configured: false, present: false };
  }

  if (client === 'chatgpt') {
    const existing = readJsonSafe(configPath);
    return {
      client: clientName,
      path: configPath,
      configured: Boolean(existing?.server_url),
      present: true,
      serverDetails: existing || null,
    };
  }

  const existing = readJsonSafe(configPath);
  const hasServer = Boolean(existing?.mcpServers?.[serverName]);
  return {
    client: clientName,
    path: configPath,
    configured: hasServer,
    present: true,
    serverDetails: existing?.mcpServers?.[serverName] || null,
  };
}
