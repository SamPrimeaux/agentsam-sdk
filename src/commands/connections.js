/**
 * Operator diagnostics for AgentSam connections (Cloudflare account grant).
 * Identity (who is this user?) is separate from the Cloudflare connector.
 */
import {
  CLOUDFLARE_CALLBACK_PATH,
  CLOUDFLARE_FIXTURE_CLIENT_ID,
  cloudflareConnectionSafeStatus,
  resolveCloudflareOAuthClient,
} from '../../packages/connectors/cloudflare/src/index.js';
import { resolveIamIssuer } from '../../packages/identity/src/contracts/auth-config.js';
import { collectRuntimeStatus } from './runtime-status.js';

function doctor(env = process.env) {
  const iam = {
    issuer: (() => {
      try {
        return resolveIamIssuer(env);
      } catch {
        return null;
      }
    })(),
    clientId: Boolean(String(env.IAM_CLIENT_ID || '').trim()),
    serverSecret: Boolean(String(env.IAM_CLIENT_SECRET || '').trim()),
    originAlias: Boolean(String(env.IAM_ORIGIN || '').trim()),
  };
  const cf = cloudflareConnectionSafeStatus(env);
  const client = resolveCloudflareOAuthClient(env);
  return { identity: iam, cloudflare: cf, client };
}

function printSetup(env = process.env) {
  const client = resolveCloudflareOAuthClient(env);
  console.log('Cloudflare connector setup');
  console.log('');
  console.log(`  callback path: ${CLOUDFLARE_CALLBACK_PATH}`);
  console.log('  Register full https://<local-studio-host>' + CLOUDFLARE_CALLBACK_PATH);
  console.log('  on the Cloudflare OAuth client (CLOUDFLARE_OAUTH_CLIENT_ID).');
  console.log('  authorize: https://dash.cloudflare.com/oauth2/auth');
  console.log('  token:     https://dash.cloudflare.com/oauth2/token');
  console.log('  revoke:    https://dash.cloudflare.com/oauth2/revoke');
  console.log('');
  console.log('This CLI does not mint a real Cloudflare OAuth client.');
  console.log('Fixture client id ' + CLOUDFLARE_FIXTURE_CLIENT_ID + ' is local-only and must never be installed on production.');
  if (client.fixture) {
    console.log('STOP: fixture credentials are loaded. OAuth start will return 503.');
  } else if (client.status === 'not_configured') {
    console.log('status: not_configured — set CLOUDFLARE_OAUTH_CLIENT_ID on the Local Studio Worker.');
  } else {
    console.log(`status: ${client.status}`);
  }
  return 0;
}

function bindingKey(row = {}) {
  return String(row.name || '').trim();
}

function bindingTypeLabel(type = '') {
  switch (String(type || '').trim()) {
    case 'plain_text': return 'Variable';
    case 'json': return 'Variable (JSON)';
    case 'secret_text': return 'Secret';
    case 'secret_key': return 'Secret key';
    case 'ai': return 'Workers AI';
    case 'd1': return 'D1 database';
    case 'service': return 'Service binding';
    case 'hyperdrive': return 'Hyperdrive';
    case 'vpc_service': return 'VPC Service';
    case 'r2_bucket': return 'R2 bucket';
    case 'assets': return 'Assets';
    default: return String(type || 'Binding');
  }
}

function bindingTarget(row = {}) {
  if (row.type === 'secret_text' || row.type === 'secret_key') return 'Value encrypted';
  if (row.value != null) return String(row.value);
  if (row.database_name) return row.database_name;
  if (row.bucket_name) return row.bucket_name;
  if (row.service) return row.environment ? `${row.service} · ${row.environment}` : row.service;
  if (row.index_name) return row.index_name;
  if (row.database_id) return row.database_id;
  if (row.service_id) return row.service_id;
  if (row.id) return row.id;
  if (row.namespace) return row.namespace;
  if (row.store_id && row.secret_name) return `${row.store_id} · ${row.secret_name}`;
  return '';
}

function renderBindingRows(rows = []) {
  if (!rows.length) return ['    none'];
  const width = Math.min(32, Math.max(4, ...rows.map((row) => bindingKey(row).length)));
  return rows.map((row) => {
    const name = bindingKey(row).padEnd(width);
    const type = bindingTypeLabel(row.type);
    const target = bindingTarget(row);
    return `    ${name}  ${type}${target ? ` · ${target}` : ''}`;
  });
}

function renderWorkerBindings(status) {
  const cloudflare = status.cloudflare || {};
  const bindings = cloudflare.bindings;
  if (!bindings) return ['  Worker runtime    not verified'];

  const variables = Array.isArray(bindings.runtime_variables) ? bindings.runtime_variables : [];
  const secrets = Array.isArray(bindings.runtime_secrets) ? bindings.runtime_secrets : [];
  const resources = Array.isArray(bindings.resources) ? bindings.resources : [];
  const declared = Array.isArray(bindings.declared) ? bindings.declared : [];
  const missing = Array.isArray(bindings.missing) ? bindings.missing : [];
  const mismatches = Array.isArray(bindings.type_mismatches) ? bindings.type_mismatches : [];

  const lines = [];
  if (cloudflare.version?.id || cloudflare.version?.number != null) {
    const versionLabel = cloudflare.version?.number != null ? `v${cloudflare.version.number}` : 'version';
    lines.push(`  live Worker       ${versionLabel}${cloudflare.version?.id ? ` · ${cloudflare.version.id}` : ''}`);
  }

  lines.push('');
  lines.push(`  Runtime variables and secrets  ${variables.length} variables · ${secrets.length} secrets`);
  lines.push(...renderBindingRows([...variables, ...secrets].sort((a, b) => bindingKey(a).localeCompare(bindingKey(b)))));

  lines.push('');
  lines.push(`  Bindings          ${resources.length} live resources`);
  lines.push(...renderBindingRows(resources.sort((a, b) => bindingKey(a).localeCompare(bindingKey(b)))));

  lines.push('');
  lines.push(`  Config comparison ${declared.length} declared locally · ${missing.length} missing live · ${mismatches.length} type mismatch`);
  if (cloudflare.config) lines.push(`    source           ${cloudflare.config}`);
  if (missing.length) {
    for (const row of missing) lines.push(`    ✗ ${bindingKey(row)} · declared ${row.type || 'unknown'} · missing from live version`);
  }
  if (mismatches.length) {
    for (const row of mismatches) lines.push(`    ! ${bindingKey(row)} · declared ${row.declared || 'unknown'} · live ${row.live || 'unknown'}`);
  }

  return lines;
}

function renderConnections(status) {
  const lines = ['', '  Agent Sam · connections', ''];
  lines.push(`  IAM account       ${status.identity?.authenticated ? 'connected' : 'not connected'}`);
  lines.push(`  active auth       ${status.identity?.active_auth?.kind || 'none'}`);
  lines.push(`  model providers   ${(status.model_summary?.configured_providers || []).join(', ') || 'none configured'}`);
  lines.push(`  terminal registry ${status.terminal?.connected ? `${status.terminal.active_connection_count} active / ${status.terminal.connections.length} total` : `unavailable · ${status.terminal?.error || 'not authenticated'}`}`);
  for (const row of status.terminal?.connections || []) {
    lines.push(`    ${row.default ? '★' : '•'} ${row.name || row.id} · ${row.kind || 'terminal'} · ${row.active ? 'active' : 'inactive'} · ${row.health}`);
  }
  lines.push(`  Worker            ${status.cloudflare?.connected ? `${status.cloudflare.worker_name} · live` : status.cloudflare?.configured ? `${status.cloudflare.worker_name} · not verified` : 'not configured'}`);
  lines.push(...renderWorkerBindings(status));
  lines.push('');
  lines.push('  Live Cloudflare binding names/targets are shown; secret values and terminal endpoint credentials are never printed.');
  lines.push('');
  return lines.join('\n');
}

export async function runConnections(args = [], options = {}) {
  const argv = args.filter((a) => a !== '--json');
  const jsonMode = args.includes('--json');
  const env = options.env || process.env;
  const write = options.write || ((value) => process.stdout.write(value));
  if (argv[0] === 'cloudflare' && argv[1] === 'setup') {
    if (jsonMode) {
      write(`${JSON.stringify({
        callback: PRODUCTION_CALLBACK,
        authorize: 'https://dash.cloudflare.com/oauth2/auth',
        token: 'https://dash.cloudflare.com/oauth2/token',
        revoke: 'https://dash.cloudflare.com/oauth2/revoke',
        mintsRealClient: false,
        client: resolveCloudflareOAuthClient(env),
      }, null, 2)}\n`);
      return 0;
    }
    return printSetup(env);
  }
  if (argv.length) throw new Error(`unknown connections option: ${argv[0]}`);
  const status = await (options.collectRuntime || collectRuntimeStatus)({
    ...options,
    env,
    cwd: options.cwd || process.cwd(),
    discoverModels: true,
  });
  if (jsonMode) {
    write(`${JSON.stringify({
      schema_version: status.schema_version,
      identity: status.identity,
      providers: status.models?.providers || [],
      terminal: status.terminal,
      cloudflare: status.cloudflare,
    }, null, 2)}\n`);
    return status;
  }
  write(renderConnections(status));
  return status;
}
