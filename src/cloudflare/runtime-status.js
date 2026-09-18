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

function declaredBindings(config = {}) {
  const rows = [];
  const add = (name, type) => { if (clean(name)) rows.push({ name: clean(name), type }); };
  for (const name of Object.keys(config.vars || {})) add(name, 'plain_text');
  for (const row of config.d1_databases || []) add(row?.binding, 'd1');
  for (const row of config.hyperdrive || []) add(row?.binding, 'hyperdrive');
  for (const row of config.r2_buckets || []) add(row?.binding, 'r2_bucket');
  for (const row of config.services || []) add(row?.binding, 'service');
  for (const row of config.vpc_services || []) add(row?.binding, 'vpc_service');
  add(config.ai?.binding, 'ai');
  add(config.assets?.binding, 'assets');
  return rows.sort((left, right) => left.name.localeCompare(right.name));
}

export function readCloudflareDeploymentContract(root, projectConfig = {}) {
  const deployment = projectConfig?.deployment?.cloudflare || {};
  const workerName = clean(deployment.worker_name);
  const relativeConfig = clean(deployment.config);
  const configPath = relativeConfig ? path.resolve(root, relativeConfig) : null;
  if (!workerName && !configPath) return { configured: false, worker_name: null, config: null, bindings: [], routes: [], health_url: null };
  if (!workerName || !configPath) throw new Error('cloudflare_deployment_contract_incomplete');
  if (configPath !== path.resolve(root) && !configPath.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('cloudflare_deployment_config_outside_project');
  const parsed = parseJsonc(fs.readFileSync(configPath, 'utf8'));
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
    const liveBindings = Array.isArray(version?.data?.resources?.bindings) ? version.data.resources.bindings : [];
    const liveByName = new Map(liveBindings.map((row) => [clean(row?.name), clean(row?.type)]));
    const missing = contract.bindings.filter((row) => !liveByName.has(row.name));
    const typeMismatches = contract.bindings.filter((row) => liveByName.has(row.name) && liveByName.get(row.name) !== row.type)
      .map((row) => ({ name: row.name, declared: row.type, live: liveByName.get(row.name) }));
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
        live: liveBindings.map((row) => ({ name: clean(row?.name), type: clean(row?.type) })).filter((row) => row.name),
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
