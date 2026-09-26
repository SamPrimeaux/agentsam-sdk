/**
 * Local terminal surface discovery (ExecOS profiles + machine identity).
 * Complements remote /api/sdk/context terminal projection — whoami must not
 * claim terminal.available=false when paired devices exist on this machine.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectMachineIdentity } from './terminal/machine-identity.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function homeDirectory(options = {}) {
  return path.resolve(
    clean(options.home)
    || clean(options.env?.HOME)
    || clean(options.env?.USERPROFILE)
    || os.homedir(),
  );
}

function parseEnvFile(filePath) {
  const out = {};
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  } catch {
    /* ignore */
  }
  return out;
}

function listExecosProfiles(options = {}) {
  const dir = path.join(homeDirectory(options), '.execos', 'profiles');
  if (!fs.existsSync(dir)) return [];
  const rows = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.env')) continue;
    const full = path.join(dir, name);
    const env = parseEnvFile(full);
    const instanceId = clean(env.IAM_INSTANCE_ID) || path.basename(name, '.env');
    rows.push({
      id: instanceId,
      instance_id: instanceId,
      name: instanceId,
      kind: 'local_device',
      provider: 'execos',
      compute_provider: 'execos',
      status: clean(env.IAM_CONNECTION_KEY) ? 'paired' : 'profile',
      hostname: null,
      platform: process.platform === 'darwin' ? 'macos' : process.platform,
      arch: process.arch === 'arm64' ? 'arm64' : process.arch,
      hw_model: null,
      active_connection_count: clean(env.IAM_CONNECTION_ID) ? 1 : 0,
      default_connection_id: clean(env.IAM_CONNECTION_ID) || null,
      last_seen_at: null,
      last_seen_at_iso: null,
      source: 'execos_profile',
      profile_path: full,
      public_url: clean(env.TUNNEL_URL) || null,
      endpoint_url: clean(env.TUNNEL_URL) || null,
      connection_id: clean(env.IAM_CONNECTION_ID) || null,
      account_id: clean(env.IAM_ACCOUNT_ID) || null,
    });
  }
  return rows;
}

/**
 * @returns {Promise<{ available: boolean, instances: object[], connections: object[], local: object }>}
 */
export async function collectLocalTerminalContext(options = {}) {
  const identity = await (options.collectIdentity || collectMachineIdentity)();
  const profiles = listExecosProfiles(options);
  const instances = profiles.map((row) => ({
    ...row,
    hostname: row.hostname || identity.hostname || null,
    hw_model: row.hw_model || identity.model || null,
    arch: row.arch || identity.arch || null,
    platform: row.platform || identity.platform || null,
  }));

  const connections = profiles
    .filter((row) => row.connection_id)
    .map((row) => ({
      id: row.connection_id,
      connection_id: row.connection_id,
      instance_id: row.instance_id,
      name: row.name,
      kind: 'local_device',
      provider: 'execos',
      compute_provider: 'execos',
      transport: 'tunnel',
      transport_provider: 'cloudflare_tunnel',
      endpoint_url: row.endpoint_url,
      route_hostname: null,
      public_url: row.public_url,
      is_active: true,
      is_default: true,
      health_status: 'local_profile',
      last_seen_at: null,
      last_seen_at_iso: null,
      source: 'execos_profile',
    }));

  return {
    available: instances.length > 0 || Boolean(identity?.hostname),
    instances,
    connections,
    local: {
      hostname: identity.hostname || null,
      platform: identity.platform || null,
      arch: identity.arch || null,
      hw_model: identity.model || null,
      execos_profiles: profiles.length,
    },
  };
}

/**
 * Merge remote SDK context terminal with local ExecOS/machine discovery.
 * Local paired devices must remain visible even when remote context is empty.
 */
export function mergeTerminalContexts(remote = {}, local = {}) {
  const byInstance = new Map();
  for (const row of remote?.instances || []) {
    const id = row?.id || row?.instance_id;
    if (id) byInstance.set(id, { ...row, source: row.source || 'remote' });
  }
  for (const row of local?.instances || []) {
    const id = row?.id || row?.instance_id;
    if (!id) continue;
    if (!byInstance.has(id)) byInstance.set(id, row);
    else byInstance.set(id, { ...byInstance.get(id), ...row, source: 'merged' });
  }

  const byConnection = new Map();
  for (const row of remote?.connections || []) {
    const id = row?.id || row?.connection_id;
    if (id) byConnection.set(id, { ...row, source: row.source || 'remote' });
  }
  for (const row of local?.connections || []) {
    const id = row?.id || row?.connection_id;
    if (!id) continue;
    if (!byConnection.has(id)) byConnection.set(id, row);
  }

  const instances = [...byInstance.values()];
  const connections = [...byConnection.values()];
  return {
    available: remote?.available === true || local?.available === true || instances.length > 0,
    instances,
    connections,
    local: local?.local || null,
  };
}
