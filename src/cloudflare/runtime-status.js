import fs from 'node:fs';
import path from 'node:path';
import { runWranglerNative } from './wrangler.js';

function clean(value) { return value == null ? '' : String(value).trim(); }

function parseJsonc(source) {
  let output = '';
  let string = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') { lineComment = false; output += char; }
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
    if (string) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') string = false;
      continue;
    }
    if (char === '"') { string = true; output += char; continue; }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    output += char;
  }
  return JSON.parse(output.replace(/,\s*([}\]])/g, '$1'));
}

export function parseWranglerToml(source = '') {
  const result = { vars: {}, d1_databases: [], r2_buckets: [], hyperdrive: [], kv_namespaces: [], services: [] };
  const lines = source.split(/\r?\n/);
  let currentSection = '';
  let currentBlock = null;

  for (let line of lines) {
    line = line.replace(/#.*$/, '').trim();
    if (!line) continue;

    const arrMatch = line.match(/^\[\[([a-zA-Z0-9_.]+)\]\]$/);
    if (arrMatch) {
      currentSection = arrMatch[1];
      currentBlock = {};
      if (currentSection === 'd1_databases') result.d1_databases.push(currentBlock);
      else if (currentSection === 'r2_buckets') result.r2_buckets.push(currentBlock);
      else if (currentSection === 'hyperdrive') result.hyperdrive.push(currentBlock);
      else if (currentSection === 'kv_namespaces') result.kv_namespaces.push(currentBlock);
      else if (currentSection === 'services') result.services.push(currentBlock);
      continue;
    }

    const tableMatch = line.match(/^\[([a-zA-Z0-9_.]+)\]$/);
    if (tableMatch) {
      currentSection = tableMatch[1];
      currentBlock = null;
      if (currentSection === 'ai' && !result.ai) result.ai = {};
      if (currentSection === 'assets' && !result.assets) result.assets = {};
      continue;
    }

    const kvMatch = line.match(/^([a-zA-Z0-9_.-]+)\s*=\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      let rawVal = kvMatch[2].trim();
      let val = rawVal;
      if ((rawVal.startsWith('"') && rawVal.endsWith('"')) || (rawVal.startsWith("'") && rawVal.endsWith("'"))) {
        val = rawVal.slice(1, -1);
      } else if (rawVal === 'true') {
        val = true;
      } else if (rawVal === 'false') {
        val = false;
      } else if (/^\d+$/.test(rawVal)) {
        val = parseInt(rawVal, 10);
      }

      if (currentBlock) {
        currentBlock[key] = val;
      } else if (currentSection === 'vars') {
        result.vars[key] = val;
      } else if (currentSection === 'ai') {
        result.ai[key] = val;
      } else if (currentSection === 'assets') {
        result.assets[key] = val;
      } else if (!currentSection) {
        result[key] = val;
      }
    }
  }
  return result;
}

function declaredBindings(config = {}) {
  const rows = [];
  const add = (row = {}) => {
    const name = clean(row.name);
    if (name) rows.push({ ...row, name });
  };

  for (const [name, value] of Object.entries(config.vars || {})) {
    add({
      name,
      type: typeof value === 'object' && value !== null ? 'json' : 'plain_text',
      value: typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value),
      source: 'wrangler_config',
    });
  }

  for (const name of config.secrets?.required || []) {
    add({ name, type: 'secret_text', encrypted: true, source: 'wrangler_required_secret' });
  }

  for (const row of config.d1_databases || []) add({
    name: row?.binding,
    type: 'd1',
    database_name: clean(row?.database_name) || null,
    database_id: clean(row?.database_id) || null,
    source: 'wrangler_config',
  });
  for (const row of config.hyperdrive || []) add({
    name: row?.binding,
    type: 'hyperdrive',
    id: clean(row?.id) || null,
    source: 'wrangler_config',
  });
  for (const row of config.r2_buckets || []) add({
    name: row?.binding,
    type: 'r2_bucket',
    bucket_name: clean(row?.bucket_name) || null,
    source: 'wrangler_config',
  });
  for (const row of config.services || []) add({
    name: row?.binding,
    type: 'service',
    service: clean(row?.service) || null,
    environment: clean(row?.environment) || null,
    entrypoint: clean(row?.entrypoint) || null,
    source: 'wrangler_config',
  });
  for (const row of config.vpc_services || []) add({
    name: row?.binding,
    type: 'vpc_service',
    service_id: clean(row?.service_id) || null,
    source: 'wrangler_config',
  });
  if (config.ai?.binding) add({ name: config.ai.binding, type: 'ai', source: 'wrangler_config' });
  if (config.assets?.binding) add({
    name: config.assets.binding,
    type: 'assets',
    directory: clean(config.assets?.directory) || null,
    source: 'wrangler_config',
  });
  for (const row of config.kv_namespaces || []) add({
    name: row?.binding,
    type: 'kv_namespace',
    id: clean(row?.id) || null,
    source: 'wrangler_config',
  });
  for (const row of config.vectorize || []) add({
    name: row?.binding,
    type: 'vectorize',
    index_name: clean(row?.index_name) || null,
    source: 'wrangler_config',
  });
  const queueProducers = Array.isArray(config.queues?.producers) ? config.queues.producers : [];
  for (const row of queueProducers) add({
    name: row?.binding,
    type: 'queue',
    queue_name: clean(row?.queue) || null,
    source: 'wrangler_config',
  });

  return rows.sort((left, right) => left.name.localeCompare(right.name));
}

function safeLiveBinding(row = {}) {
  const name = clean(row?.name);
  const type = clean(row?.type);
  if (!name) return null;

  const output = { name, type: type || 'unknown', source: 'cloudflare_live_version' };
  if (type === 'secret_text' || type === 'secret_key') {
    output.encrypted = true;
    return output;
  }

  if (type === 'plain_text') {
    const value = row?.text ?? row?.value;
    if (value != null) output.value = String(value);
  } else if (type === 'json') {
    const value = row?.json ?? row?.value;
    if (value != null) output.value = typeof value === 'string' ? value : JSON.stringify(value);
  }

  for (const key of [
    'id',
    'database_id',
    'database_name',
    'bucket_name',
    'service',
    'environment',
    'entrypoint',
    'service_id',
    'index_name',
    'namespace',
    'class_name',
    'script_name',
    'store_id',
    'secret_name',
  ]) {
    const value = row?.[key];
    if (value != null && clean(value)) output[key] = clean(value);
  }

  return output;
}

function bindingCategory(row = {}) {
  const type = clean(row?.type);
  if (type === 'secret_text' || type === 'secret_key') return 'secret';
  if (type === 'plain_text' || type === 'json') return 'variable';
  return 'resource';
}

export function readCloudflareDeploymentContract(root, projectConfig = {}) {
  const deployment = projectConfig?.deployment?.cloudflare || {};
  let workerName = clean(deployment.worker_name);
  let relativeConfig = clean(deployment.config);
  let configPath = relativeConfig ? path.resolve(root, relativeConfig) : null;

  // Auto-discover candidate wrangler config when not explicitly specified
  if (!workerName && !configPath) {
    const candidates = [
      'wrangler.jsonc',
      'wrangler.json',
      'wrangler.toml',
      'backend/wrangler.jsonc',
      'backend/wrangler.json',
      'backend/wrangler.toml',
      'worker/wrangler.jsonc',
      'worker/wrangler.json',
      'worker/wrangler.toml',
      'apps/local-studio/backend/wrangler.jsonc',
    ];
    for (const rel of candidates) {
      const candidatePath = path.resolve(root, rel);
      if (fs.existsSync(candidatePath)) {
        try {
          const raw = fs.readFileSync(candidatePath, 'utf8');
          const parsed = rel.endsWith('.toml') ? parseWranglerToml(raw) : parseJsonc(raw);
          if (clean(parsed?.name)) {
            workerName = clean(parsed.name);
            relativeConfig = rel;
            configPath = candidatePath;
            break;
          }
        } catch {
          // ignore candidate error
        }
      }
    }
  }

  if (!workerName && !configPath) return { configured: false, worker_name: null, config: null, bindings: [], routes: [], health_url: null };
  if (!workerName || !configPath) throw new Error('cloudflare_deployment_contract_incomplete');
  if (configPath !== path.resolve(root) && !configPath.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('cloudflare_deployment_config_outside_project');
  const rawSource = fs.readFileSync(configPath, 'utf8');
  const parsed = configPath.endsWith('.toml') ? parseWranglerToml(rawSource) : parseJsonc(rawSource);
  if (clean(parsed.name) !== workerName) throw new Error(`cloudflare_worker_name_mismatch:${workerName}:${clean(parsed.name) || 'missing'}`);
  const routes = (parsed.routes || []).map((row) => typeof row === 'string' ? row : clean(row?.pattern)).filter(Boolean);
  const customDomain = routes.find((value) => !value.includes('*')) || '';
  return {
    configured: true,
    worker_name: workerName,
    config: relativeConfig,
    config_path: configPath,
    bindings: declaredBindings(parsed),
    routes,
    health_url: clean(deployment.health_url) || (customDomain ? `https://${customDomain}/health` : null),
  };
}

export function resolveProjectD1Database(root = process.cwd()) {
  try {
    const contract = readCloudflareDeploymentContract(root);
    if (contract?.bindings) {
      const dbBinding = contract.bindings.find((b) => b.name === 'DB' && b.type === 'd1')
        || contract.bindings.find((b) => b.type === 'd1');
      if (dbBinding) {
        return clean(dbBinding.database_name) || clean(dbBinding.name) || '';
      }
    }
  } catch {
    // ignore
  }
  return clean(process.env.DB) || '';
}

function newest(rows = [], dateAt) {
  return [...rows].sort((left, right) => Date.parse(dateAt(right) || 0) - Date.parse(dateAt(left) || 0))[0] || null;
}

async function probeHealth(url, fetchImpl) {
  if (!url) return { configured: false, ok: null, status: null, url: null, data: null, error: null };
  try {
    const response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8_000) });
    const data = await response.json().catch(() => null);
    return { configured: true, ok: response.ok && data?.ok !== false, status: response.status, url, data, error: null };
  } catch (error) {
    return { configured: true, ok: false, status: null, url, data: null, error: error?.message || String(error) };
  }
}

export async function collectCloudflareDeploymentStatus(options = {}) {
  const root = path.resolve(options.root || options.cwd || process.cwd());
  let contract;
  try {
    contract = readCloudflareDeploymentContract(root, options.projectConfig || {});
  } catch (error) {
    return { configured: true, connected: false, contract_error: error?.message || String(error), worker_name: null, bindings: null, health: null, error: 'deployment_contract_invalid' };
  }
  if (!contract.configured) return { ...contract, connected: false, offline: options.offline === true, bindings: null, health: null, error: null };
  if (options.offline === true) return { ...contract, connected: false, offline: true, bindings: null, health: null, error: null };

  const runner = options.runWrangler || runWranglerNative;
  const base = { cwd: root, config: contract.config, name: contract.worker_name };
  try {
    const [identity, deployments, versions, health] = await Promise.all([
      runner('whoami', base),
      runner('deployments.list', base),
      runner('versions.list', base),
      probeHealth(contract.health_url, options.fetchImpl || fetch),
    ]);
    const deploymentRows = Array.isArray(deployments?.data) ? deployments.data : [];
    const versionRows = Array.isArray(versions?.data) ? versions.data : [];
    const activeDeployment = newest(deploymentRows, row => row?.created_on);
    const activeVersionId = clean(activeDeployment?.versions?.find((row) => Number(row?.percentage) === 100)?.version_id)
      || clean(newest(versionRows, row => row?.metadata?.created_on)?.id);
    const version = activeVersionId ? await runner('versions.view', { ...base, version_id: activeVersionId }) : null;
    const rawLiveBindings = Array.isArray(version?.data?.resources?.bindings)
      ? version.data.resources.bindings
      : Array.isArray(version?.data?.bindings)
        ? version.data.bindings
        : [];
    const liveBindings = rawLiveBindings.map(safeLiveBinding).filter(Boolean);
    const liveByName = new Map(liveBindings.map((row) => [row.name, row]));
    const missing = contract.bindings.filter((row) => !liveByName.has(row.name));
    const typeMismatches = contract.bindings.filter((row) => liveByName.has(row.name) && liveByName.get(row.name).type !== row.type)
      .map((row) => ({ name: row.name, declared: row.type, live: liveByName.get(row.name).type }));
    const runtimeVariables = liveBindings.filter((row) => bindingCategory(row) === 'variable');
    const runtimeSecrets = liveBindings.filter((row) => bindingCategory(row) === 'secret');
    const resourceBindings = liveBindings.filter((row) => bindingCategory(row) === 'resource');
    return {
      ...contract,
      connected: true,
      offline: false,
      identity: identity?.data ? {
        logged_in: identity.data.loggedIn === true,
        auth_type: identity.data.authType || null,
        accounts: (identity.data.accounts || []).map((row) => ({ id: row?.id || null, name: row?.name || null, type: row?.type || null })),
      } : null,
      deployment: activeDeployment,
      version: version?.data ? {
        id: version.data.id || activeVersionId,
        number: version.data.number ?? null,
        created_on: version.data.metadata?.created_on || null,
        source: version.data.metadata?.source || null,
      } : null,
      bindings: {
        declared: contract.bindings,
        live: liveBindings,
        runtime_variables: runtimeVariables,
        runtime_secrets: runtimeSecrets,
        resources: resourceBindings,
        missing,
        type_mismatches: typeMismatches,
        match: missing.length === 0 && typeMismatches.length === 0,
      },
      health,
      error: null,
    };
  } catch (error) {
    return { ...contract, connected: false, offline: false, bindings: null, health: await probeHealth(contract.health_url, options.fetchImpl || fetch), error: error?.message || String(error) };
  }
}
