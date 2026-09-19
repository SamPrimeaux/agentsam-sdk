import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MCP_AUTHORITY_SCHEMA = 'agentsam.mcp.authority.v1';
export const SERVER_CATALOG_CACHE_SCHEMA = 'agentsam.mcp.server-catalog.v1';
export const DEFAULT_SERVER_CATALOG_URL = 'https://mcp.inneranimalmedia.com/api/mcp/servers';

/**
 * Seed MCP server catalog snapshot derived directly from D1 table:
 * `agentsam_mcp_servers`.
 *
 * Captures live server authority, authentication requirements, and live health metrics
 * for offline and instantaneous CLI resolution.
 */
export const SEED_MCP_SERVER_CATALOG = Object.freeze([
  {
    name: 'inneranimalmedia',
    display_name: 'InnerAnimalMedia Main MCP',
    url: 'https://mcp.inneranimalmedia.com/mcp',
    authUrl: 'https://mcp.inneranimalmedia.com/auth/connect',
    auth_type: 'bearer',
    protocol: 'sse',
    defaultClients: ['cursor', 'claude'],
    health_status: 'healthy',
    avg_latency_ms: 443,
    error_rate: 0,
    description: 'Inner Animal Media canonical MCP server (~218 tools, D1 telemetry)',
  },
  {
    name: 'agent_sam_bridge',
    display_name: 'Agent Sam Bridge MCP',
    url: 'https://mcp.inneranimalmedia.com/mcp',
    auth_type: 'bearer',
    protocol: 'sse',
    defaultClients: ['cursor'],
    health_status: 'healthy',
    avg_latency_ms: 432,
    error_rate: 0,
    description: 'Agent Sam Bridge MCP',
  },
  {
    name: 'cloudflare-api',
    display_name: 'Cloudflare API',
    url: 'https://mcp.cloudflare.com/mcp',
    auth_type: 'bearer',
    protocol: 'sse',
    defaultClients: ['cursor'],
    health_status: 'degraded',
    avg_latency_ms: 9,
    error_rate: 0,
    description: 'Cloudflare API (Codex registered)',
  },
  {
    name: 'cloudflare-docs',
    display_name: 'Cloudflare Docs',
    url: 'https://docs.mcp.cloudflare.com/mcp',
    auth_type: 'none',
    protocol: 'sse',
    defaultClients: ['cursor'],
    health_status: 'degraded',
    avg_latency_ms: 10,
    error_rate: 0,
    description: 'Cloudflare documentation reference tools',
  },
  {
    name: 'cloudflare-bindings',
    display_name: 'Cloudflare Bindings',
    url: 'https://bindings.mcp.cloudflare.com/mcp',
    auth_type: 'user_oauth_cloudflare',
    protocol: 'sse',
    defaultClients: ['cursor'],
    health_status: 'degraded',
    avg_latency_ms: 8,
    error_rate: 0,
    description: 'Cloudflare Workers storage, AI, and compute bindings',
  },
  {
    name: 'cloudflare-builds',
    display_name: 'Cloudflare Builds',
    url: 'https://builds.mcp.cloudflare.com/mcp',
    auth_type: 'bearer',
    protocol: 'sse',
    defaultClients: ['cursor'],
    health_status: 'degraded',
    avg_latency_ms: 6,
    error_rate: 0,
    description: 'Cloudflare Workers Builds and CI/CD operations',
  },
  {
    name: 'cloudflare-observability',
    display_name: 'Cloudflare Observability',
    url: 'https://observability.mcp.cloudflare.com/mcp',
    auth_type: 'bearer',
    protocol: 'sse',
    defaultClients: ['cursor'],
    health_status: 'degraded',
    avg_latency_ms: 10,
    error_rate: 0,
    description: 'Cloudflare logs and analytics tools',
  },
  {
    name: 'github-official',
    display_name: 'GitHub (official)',
    url: 'https://api.githubcopilot.com/mcp/',
    auth_type: 'user_oauth_github',
    protocol: 'sse',
    defaultClients: ['cursor'],
    health_status: 'degraded',
    avg_latency_ms: 338,
    error_rate: 0,
    description: 'Official GitHub Copilot MCP server',
  },
  {
    name: 'gmail-official',
    display_name: 'Gmail (official Google MCP)',
    url: 'https://gmailmcp.googleapis.com/mcp/v1',
    auth_type: 'user_oauth_gmail',
    protocol: 'sse',
    defaultClients: ['cursor'],
    health_status: 'degraded',
    avg_latency_ms: 662,
    error_rate: 0,
    description: 'Official Google Gmail MCP server',
  },
  {
    name: 'cf_builds',
    display_name: 'Cloudflare Builds System',
    url: 'internal',
    auth_type: 'bearer',
    protocol: 'sse',
    defaultClients: ['cursor'],
    health_status: 'unknown',
    avg_latency_ms: null,
    error_rate: 0,
    description: 'Cloudflare internal builds system',
  },
]);

/**
 * Backward compatibility dictionary mapping server_key/name to preset definition.
 */
export const MCP_PRESETS = Object.freeze(
  Object.fromEntries(SEED_MCP_SERVER_CATALOG.map((s) => [s.name, s])),
);

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function homeDirectory(options = {}) {
  return path.resolve(clean(options.home) || clean(options.env?.HOME) || clean(options.env?.USERPROFILE) || os.homedir());
}

export function getMcpDir(options = {}) {
  return path.join(homeDirectory(options), '.agentsam', 'mcp');
}

export function getServerCatalogCachePath(options = {}) {
  return path.join(getMcpDir(options), 'server-catalog-cache.json');
}

export function loadCachedServerCatalog(options = {}) {
  try {
    const cacheFile = getServerCatalogCachePath(options);
    if (!fs.existsSync(cacheFile)) return null;
    const raw = fs.readFileSync(cacheFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.servers)) {
      return {
        schema_version: parsed.schema_version,
        fetched_at: parsed.fetched_at || null,
        servers: parsed.servers.filter((s) => Number(s.is_active ?? 1) !== 0),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCachedServerCatalog(servers = [], options = {}) {
  const cacheFile = getServerCatalogCachePath(options);
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  const payload = {
    schema_version: SERVER_CATALOG_CACHE_SCHEMA,
    fetched_at: new Date().toISOString(),
    servers: Array.isArray(servers) ? servers : [],
  };
  fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return payload;
}

export async function fetchMcpServerCatalog(options = {}) {
  const url = options.catalogUrl || DEFAULT_SERVER_CATALOG_URL;
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
      if (body?.ok && Array.isArray(body.servers)) {
        writeCachedServerCatalog(body.servers, options);
        return body.servers.filter((s) => Number(s.is_active ?? 1) !== 0);
      }
    }
  } catch {
    // Network failure / timeout — fall through to cache
  }

  const cached = loadCachedServerCatalog(options);
  if (cached?.servers?.length) {
    return cached.servers;
  }

  return SEED_MCP_SERVER_CATALOG;
}

export function listKnownServers(options = {}) {
  const cached = loadCachedServerCatalog(options);
  if (cached?.servers?.length) {
    return cached.servers;
  }
  return SEED_MCP_SERVER_CATALOG;
}

export function resolveServerPreset(name, options = {}) {
  const cleanName = clean(name).toLowerCase();
  if (!cleanName) return null;

  const catalog = listKnownServers(options);
  const found = catalog.find((s) => (s.name || s.server_key || '').toLowerCase() === cleanName);
  if (found) {
    return {
      name: found.name || found.server_key,
      display_name: found.display_name || found.name || found.server_key,
      url: found.url,
      authUrl: found.authUrl || (found.name === 'inneranimalmedia' ? 'https://mcp.inneranimalmedia.com/auth/connect' : null),
      auth_type: found.auth_type || 'bearer',
      protocol: found.protocol || 'sse',
      defaultClients: found.defaultClients || ['cursor'],
      health_status: found.health_status || 'unknown',
      avg_latency_ms: found.avg_latency_ms ?? null,
      error_rate: found.error_rate ?? 0,
      description: found.description || found.display_name || '',
    };
  }

  return MCP_PRESETS[cleanName] || null;
}

export function getMcpServerConfigPath(name, options = {}) {
  const safeName = clean(name).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  if (!safeName) throw new Error('mcp_server_name_required');
  return path.join(getMcpDir(options), `${safeName}.json`);
}

function ensureSecureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(dir, 0o700);
    } catch {
      // Best-effort permissions
    }
  }
}

export function readMcpServer(name, options = {}) {
  try {
    const filePath = getMcpServerConfigPath(name, options);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeMcpServer(name, serverConfig, options = {}) {
  const dir = getMcpDir(options);
  ensureSecureDir(dir);

  const filePath = getMcpServerConfigPath(name, options);
  const now = new Date().toISOString();
  const existing = readMcpServer(name, options);

  const record = {
    schema_version: MCP_AUTHORITY_SCHEMA,
    name: clean(name).toLowerCase(),
    url: clean(serverConfig.url),
    protocol: clean(serverConfig.protocol) || 'sse',
    auth: serverConfig.auth || null,
    clients: Array.isArray(serverConfig.clients) ? [...new Set(serverConfig.clients.map(clean).filter(Boolean))] : ['cursor'],
    metadata: serverConfig.metadata || {},
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), {
    mode: 0o600,
  });

  return record;
}

export function listMcpServers(options = {}) {
  const dir = getMcpDir(options);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('-cache.json'));
  const servers = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (parsed && parsed.name && parsed.schema_version === MCP_AUTHORITY_SCHEMA) {
        servers.push(parsed);
      }
    } catch {
      // Ignore corrupt entries
    }
  }
  return servers.sort((a, b) => a.name.localeCompare(b.name));
}

export function deleteMcpServer(name, options = {}) {
  try {
    const filePath = getMcpServerConfigPath(name, options);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
