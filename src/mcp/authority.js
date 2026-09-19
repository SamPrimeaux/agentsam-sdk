import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MCP_AUTHORITY_SCHEMA = 'agentsam.mcp.authority.v1';

export const MCP_PRESETS = Object.freeze({
  inneranimalmedia: {
    name: 'inneranimalmedia',
    url: 'https://mcp.inneranimalmedia.com/mcp',
    authUrl: 'https://mcp.inneranimalmedia.com/auth/connect',
    protocol: 'sse',
    defaultClients: ['cursor'],
    description: 'Inner Animal Media canonical MCP server (~218 tools, D1 telemetry)',
  },
});

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function homeDirectory(options = {}) {
  return path.resolve(clean(options.home) || clean(options.env?.HOME) || clean(options.env?.USERPROFILE) || os.homedir());
}

export function getMcpDir(options = {}) {
  return path.join(homeDirectory(options), '.agentsam', 'mcp');
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

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const servers = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (parsed && parsed.name) {
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
