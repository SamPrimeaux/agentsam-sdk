import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { homeDirectory } from './authority.js';

export const SUPPORTED_CLIENTS = Object.freeze(['cursor', 'claude']);

export function getClientConfigPath(clientName, options = {}) {
  const home = homeDirectory(options);
  const client = String(clientName || '').toLowerCase().trim();

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
  const client = String(clientName || '').toLowerCase().trim();
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
  if (!exists) {
    return { client: clientName, path: configPath, configured: false, present: false };
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
