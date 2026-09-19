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

const PRODUCTION_CALLBACK = `https://agentsam.inneranimalmedia.com${CLOUDFLARE_CALLBACK_PATH}`;

function doctor(env = process.env) {
  const iam = {
    issuer: resolveIamIssuer(env),
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
  console.log(`  callback: ${PRODUCTION_CALLBACK}`);
  console.log('  authorize: https://dash.cloudflare.com/oauth2/auth');
  console.log('  token:     https://dash.cloudflare.com/oauth2/token');
  console.log('  revoke:    https://dash.cloudflare.com/oauth2/revoke');
  console.log('');
  console.log('This CLI does not mint a real Cloudflare OAuth client.');
  console.log('Fixture client id ' + CLOUDFLARE_FIXTURE_CLIENT_ID + ' is local-only and must never be installed on production.');
  if (client.fixture) {
    console.log('STOP: fixture credentials are loaded. OAuth start will return 503.');
  } else if (client.status === 'not_configured') {
    console.log('status: not_configured — production may deploy; connector stays optional.');
  } else {
    console.log(`status: ${client.status}`);
  }
  return 0;
}

function bindingKey(row = {}) {
  return String(row.name || '').trim();
}

function renderWorkerBindings(status) {
  const cloudflare = status.cloudflare || {};
  const bindings = cloudflare.bindings;
  if (!bindings) return ['  Worker bindings   not verified'];

  const declared = Array.isArray(bindings.declared) ? bindings.declared : [];
  const live = Array.isArray(bindings.live) ? bindings.live : [];
  const missing = Array.isArray(bindings.missing) ? bindings.missing : [];
  const mismatches = Array.isArray(bindings.type_mismatches) ? bindings.type_mismatches : [];

  const liveByName = new Map(live.map((row) => [bindingKey(row), row]));
  const missingNames = new Set(missing.map(bindingKey));
  const mismatchByName = new Map(mismatches.map((row) => [bindingKey(row), row]));

  const summary = bindings.match
    ? `${declared.length} declared · ${live.length} live · contract satisfied`
    : `${declared.length} declared · ${live.length} live · ${missing.length} missing · ${mismatches.length} type mismatch`;

  const lines = [`  Worker bindings   ${summary}`];
  if (cloudflare.config) lines.push(`    declared from   ${cloudflare.config}`);
  if (cloudflare.version?.id || cloudflare.version?.number != null) {
    const versionLabel = cloudflare.version?.number != null ? `v${cloudflare.version.number}` : 'version';
    lines.push(`    live from       ${versionLabel}${cloudflare.version?.id ? ` · ${cloudflare.version.id}` : ''}`);
  }

  const seen = new Set();
  for (const row of declared) {
    const name = bindingKey(row);
    if (!name) continue;
    seen.add(name);
    const liveRow = liveByName.get(name);
    const mismatch = mismatchByName.get(name);
    if (missingNames.has(name) || !liveRow) {
      lines.push(`    ✗ ${name} · declared ${row.type || 'unknown'} · MISSING LIVE`);
    } else if (mismatch) {
      lines.push(`    ! ${name} · declared ${mismatch.declared || row.type || 'unknown'} · live ${mismatch.live || liveRow.type || 'unknown'}`);
    } else {
      lines.push(`    ✓ ${name} · ${liveRow.type || row.type || 'unknown'} · declared + live`);
    }
  }

  for (const row of live) {
    const name = bindingKey(row);
    if (!name || seen.has(name)) continue;
    lines.push(`    • ${name} · ${row.type || 'unknown'} · live only`);
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
  lines.push('  Binding names and types are shown; secret values and terminal endpoint credentials are never printed.');
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
