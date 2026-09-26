import path from 'node:path';
import { collectWhoami } from './whoami.js';
import { collectModelsStatus } from './models.js';
import { collectCloudflareDeploymentStatus } from '../cloudflare/index.js';
import { getJson } from '../lib/core-client.js';
import { collectLocalStatus } from '../lib/local-status.js';
import { tryReadProjectConfig } from '../lib/project-config.js';

function terminalConnection(row = {}) {
  const lastSeen = row.last_seen_at ?? null;
  const id = row.id || row.connection_id || null;
  const compute = row.compute_provider || row.provider || null;
  return {
    id,
    connection_id: id,
    instance_id: row.instance_id || null,
    name: row.name || row.connection_name || null,
    kind: row.kind || row.target_type || null,
    provider: compute,
    compute_provider: compute,
    transport: row.transport || null,
    transport_provider: row.transport_provider || null,
    endpoint_url: row.endpoint_url || null,
    route_hostname: row.route_hostname || null,
    public_url: row.public_url || row.endpoint_url || null,
    active: row.is_active === true || Number(row.is_active) === 1 || row.active === true,
    default: row.is_default === true || Number(row.is_default) === 1 || row.default === true,
    health: row.last_health_status || row.health_status || row.health || 'unknown',
    last_seen_at: lastSeen,
    last_seen_at_iso: row.last_seen_at_iso || (Number.isFinite(Number(lastSeen)) && Number(lastSeen) > 0
      ? new Date((Number(lastSeen) > 1e12 ? Number(lastSeen) : Number(lastSeen) * 1000)).toISOString()
      : null),
  };
}

function terminalInstance(row = {}) {
  const lastSeen = row.last_seen_at ?? null;
  const id = row.id || row.instance_id || null;
  const compute = row.compute_provider || row.provider || null;
  return {
    id,
    instance_id: id,
    name: row.name || null,
    kind: row.kind || null,
    provider: compute,
    compute_provider: compute,
    status: row.status || null,
    platform: row.platform || null,
    arch: row.arch || null,
    active_connection_count: Number(row.active_connection_count || 0),
    default_connection_id: row.default_connection_id || null,
    last_seen_at: lastSeen,
    last_seen_at_iso: row.last_seen_at_iso || (Number.isFinite(Number(lastSeen)) && Number(lastSeen) > 0
      ? new Date((Number(lastSeen) > 1e12 ? Number(lastSeen) : Number(lastSeen) * 1000)).toISOString()
      : null),
  };
}

export async function collectTerminalAuthorityStatus(options = {}) {
  if (options.offline === true) return { connected: false, offline: true, instances: [], connections: [], error: null };
  const loader = options.getJsonImpl || getJson;
  const requestOptions = {
    env: options.env || process.env,
    home: options.home,
    explicit: options.token || '',
    fetchImpl: options.fetchImpl,
  };
  try {
    const [instances, connections] = await Promise.all([
      loader('/api/terminal/instances', requestOptions),
      loader('/api/terminal/connections', requestOptions),
    ]);
    return {
      connected: true,
      offline: false,
      instances: (instances?.instances || []).map(terminalInstance),
      connections: (connections?.connections || []).map(terminalConnection),
      error: null,
    };
  } catch (error) {
    return { connected: false, offline: false, instances: [], connections: [], error: error?.message || String(error) };
  }
}

export async function collectRuntimeStatus(options = {}) {
  const cwd = options.cwd || process.cwd();
  const localCollector = options.collectLocal || collectLocalStatus;
  const identityCollector = options.collectIdentity || collectWhoami;
  const modelCollector = options.collectModels || collectModelsStatus;
  const cloudflareCollector = options.collectCloudflare || collectCloudflareDeploymentStatus;
  const terminalCollector = options.collectTerminal || collectTerminalAuthorityStatus;
  const offline = options.offline === true;

  const local = await localCollector(cwd);
  const projectConfig = options.projectConfig || tryReadProjectConfig(local.root);
  const [identity, models, cloudflare] = await Promise.all([
    offline
      ? identityCollector({ ...options, env: options.env || process.env, contextLoader: async () => { throw new Error('offline'); } })
      : identityCollector(options),
    modelCollector({ ...options, discoverRemote: !offline && options.discoverModels !== false }),
    cloudflareCollector({ ...options, root: local.root, projectConfig, offline }),
  ]);
  const terminal = identity.authenticated
    ? identity.terminal?.available === true
      ? {
          connected: true,
          offline: false,
          instances: identity.terminal.instances.map(terminalInstance),
          connections: identity.terminal.connections.map(terminalConnection),
          error: null,
        }
      : await terminalCollector({ ...options, offline })
    : { connected: false, offline, instances: [], connections: [], error: identity.active_auth?.error || 'account_auth_required' };

  const providerModelCount = Object.values(models.providerModels || {}).reduce((total, rows) => total + (Array.isArray(rows) ? rows.length : 0), 0);
  const activeConnections = terminal.connections.filter((row) => row.active);
  const modelStatus = {
    schemaVersion: models.schemaVersion,
    generatedAt: models.generatedAt,
    authority: models.authority,
    providers: models.providers || [],
    discovery: models.discovery || {},
    local: {
      online: models.local?.online === true,
      endpoint: models.local?.endpoint || null,
      chatModel: models.local?.chatModel || null,
      embedModel: models.local?.embedModel || null,
      models: (models.local?.models || []).map((row) => ({ name: row?.name || null })),
      error: models.local?.error || null,
    },
  };
  const checks = {
    account: identity.authenticated === true,
    models: providerModelCount > 0 || models.local?.online === true,
    terminal: local.pty?.online === true || activeConnections.length > 0,
    cloudflare: cloudflare.configured !== true || (
      cloudflare.connected === true
      && cloudflare.bindings?.match === true
      && cloudflare.health?.ok === true
    ),
  };

  return {
    schema_version: 'agentsam-runtime-status-v1',
    generated_at: new Date().toISOString(),
    offline,
    ready: Object.values(checks).every(Boolean),
    local_ready: local.db?.ready === true || local.db?.exists === false,
    checks,
    local,
    state_storage: {
      runtime: 'sqlite',
      project_root: local.root,
      path: local.db?.path || path.join(local.root, '.agentsam/data/agentsam.sqlite'),
      migrated: local.db?.ready === true,
      actor_runtime: 'none',
      connected_bindings: (cloudflare.bindings?.live || []).map((row) => ({ name: row.name, type: row.type })),
    },
    identity,
    models: modelStatus,
    model_summary: {
      verified_provider_models: providerModelCount,
      local_models: models.local?.models?.length || 0,
      configured_providers: (models.providers || []).filter((row) => row.configured).map((row) => row.id),
    },
    terminal: {
      ...terminal,
      local_pty: local.pty,
      active_connection_count: activeConnections.length,
    },
    cloudflare,
  };
}
