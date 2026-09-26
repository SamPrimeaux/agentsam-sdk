import { getJson } from '../lib/core-client.js';
import { resolveAccountAuthority } from '../lib/auth.js';
import {
  describeAccountSession,
  resolveAccountApiKey,
} from '../lib/account-session.js';
import { listProviderCredentialStatus } from '../lib/provider-credentials.js';

function writeLine(write, value = '') { write(`${value}\n`); }

function epochToIso(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

function safeTerminalContext(value = {}) {
  return {
    available: value?.available === true,
    instances: (value?.instances || []).map((row) => {
      const lastSeen = row?.last_seen_at ?? null;
      const id = row?.id || row?.instance_id || null;
      const compute = row?.compute_provider || row?.provider || null;
      return {
        id,
        instance_id: id,
        name: row?.name || null,
        kind: row?.kind || null,
        provider: compute,
        compute_provider: compute,
        status: row?.status || null,
        platform: row?.platform || null,
        arch: row?.arch || null,
        active_connection_count: Number(row?.active_connection_count || 0),
        default_connection_id: row?.default_connection_id || null,
        last_seen_at: lastSeen,
        last_seen_at_iso: row?.last_seen_at_iso || epochToIso(lastSeen),
      };
    }),
    connections: (value?.connections || []).map((row) => {
      const lastSeen = row?.last_seen_at ?? null;
      const id = row?.id || row?.connection_id || null;
      const compute = row?.compute_provider || row?.provider || null;
      return {
        id,
        connection_id: id,
        instance_id: row?.instance_id || null,
        name: row?.name || null,
        kind: row?.kind || null,
        provider: compute,
        compute_provider: compute,
        transport: row?.transport || null,
        transport_provider: row?.transport_provider || null,
        endpoint_url: row?.endpoint_url || null,
        route_hostname: row?.route_hostname || null,
        public_url: row?.public_url || row?.endpoint_url || null,
        is_active: row?.is_active === true,
        is_default: row?.is_default === true,
        health_status: row?.health_status || 'unknown',
        last_seen_at: lastSeen,
        last_seen_at_iso: row?.last_seen_at_iso || epochToIso(lastSeen),
      };
    }),
  };
}

function attachOwnerAccountId(credentials = [], ownerAccountId) {
  const owner = ownerAccountId == null ? '' : String(ownerAccountId).trim();
  if (!owner) return credentials;
  return (credentials || []).map((row) => {
    const next = {
      ...row,
      owner_account_id: owner,
    };
    if (row.provider === 'cloudflare' && row.account_id && row.account_id !== owner) {
      next.cloudflare_account_id = row.account_id;
    }
    // Platform + all providers: account_id means AgentSam au_* for this user
    next.account_id = owner;
    return next;
  });
}

function capabilityProbe(credentials = []) {
  const has = (provider) => credentials.some((row) => row.provider === provider && row.configured);
  return {
    repository: { available: true },
    database: { available: true, drivers: ['sqlite'] },
    vectors: { available: true, drivers: ['local_exact'] },
    models: {
      available: has('openai') || has('anthropic') || has('gemini') || has('xai') || has('cursor') || has('cloudflare'),
      configuredProviders: ['openai', 'anthropic', 'gemini', 'xai', 'cursor', 'cloudflare'].filter((p) => has(p)).length,
    },
    deploy: { available: has('cloudflare') },
  };
}

export async function collectWhoami(options = {}) {
  const env = options.env || process.env;
  const apiKey = resolveAccountApiKey({ env, explicit: options.token || '', home: options.home });
  const browserSession = describeAccountSession({ env, home: options.home });
  const authorityLoader = options.authorityLoader || resolveAccountAuthority;
  const active = await authorityLoader({
    env,
    explicit: options.token || '',
    home: options.home,
    nowMs: options.nowMs,
    skewMs: options.skewMs,
    refreshImpl: options.refreshImpl,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
  });
  const credentials = listProviderCredentialStatus({ env, home: options.home });

  const base = {
    schema_version: 3,
    ok: false,
    command_id: 'whoami',
    risk: 'read',
    exit_code: 1,
    format: 'json',
    loggedIn: false,
    authenticated: false,
    authType: null,
    authLabel: null,
    authority: 'inneranimalmedia',
    identity: null,
    account: null,
    credential: null,
    tokenPermissions: [],
    capabilities: capabilityProbe(credentials),
    active_auth: {
      configured: Boolean(active.value || active.error),
      kind: active.kind || null,
      source: active.source || null,
      valid: null,
      error: active.error || null,
    },
    api_key: {
      configured: Boolean(apiKey.value || apiKey.error),
      source: apiKey.source || null,
      valid: apiKey.error ? false : null,
      error: apiKey.error || null,
    },
    browser_session: browserSession,
    provider_credentials: credentials,
  };

  if (!active.value) return base;

  try {
    const loader = options.contextLoader || ((token) => getJson('/api/sdk/context', {
      env,
      home: options.home,
      bearer: token,
      fetchImpl: options.fetchImpl,
      refreshImpl: options.refreshImpl,
      nowMs: options.nowMs,
      skewMs: options.skewMs,
      signal: options.signal,
    }));
    const context = await loader(active.value);
    const authType = context?.auth_type || (active.kind === 'api_key' ? 'api_key' : 'oauth_session');
    const tokenPermissions = Array.isArray(context?.tokenPermissions)
      ? context.tokenPermissions
      : Array.isArray(context?.credential?.scopes)
        ? context.credential.scopes
        : [];
    const authLabel =
      authType === 'api_key'
        ? 'AgentSam API Key'
        : authType === 'oauth_session'
          ? 'OAuth Session'
          : String(authType);
    const ownerAccountId = context?.owner_account_id || context?.account_id || context?.user_id || null;
    const email = context?.email || context?.user?.email || active.session?.email || null;

    return {
      ...base,
      ok: true,
      exit_code: 0,
      loggedIn: true,
      authenticated: true,
      authType,
      authLabel,
      identity: {
        user_id: context?.user_id || ownerAccountId || null,
        account_id: ownerAccountId,
        owner_account_id: ownerAccountId,
        email,
      },
      account: {
        id: ownerAccountId,
        display_name: email || ownerAccountId || null,
        email,
      },
      credential: context?.credential
        ? {
            id: context.credential.id || null,
            name: context.credential.name || null,
            prefix: context.credential.prefix || null,
            environment: context.credential.environment || null,
            status: context.credential.status || 'active',
            created_at: context.credential.created_at || null,
            expires_at: context.credential.expires_at || null,
            last_used_at: context.credential.last_used_at || null,
          }
        : active.kind === 'api_key'
          ? { id: null, name: null, prefix: null, status: 'active' }
          : null,
      tokenPermissions,
      capabilities: capabilityProbe(credentials),
      active_auth: { ...base.active_auth, valid: true, error: null },
      api_key: active.kind === 'api_key' ? { ...base.api_key, valid: true, error: null } : base.api_key,
      provider_credentials: attachOwnerAccountId(credentials, ownerAccountId),
      cloudflare_connected: context?.cloudflare?.ok === true,
      byok: context?.byok && typeof context.byok === 'object'
        ? Object.fromEntries(Object.entries(context.byok).map(([key, value]) => [key, { configured: value?.configured === true }]))
        : {},
      terminal: safeTerminalContext(context?.terminal),
    };
  } catch (error) {
    const rawMessage = error?.message || String(error);
    const message = error?.status
      ? `${rawMessage} (HTTP ${error.status} from ${error.endpoint || 'server'})`
      : rawMessage;
    return {
      ...base,
      active_auth: { ...base.active_auth, valid: false, error: message },
      api_key: active.kind === 'api_key' ? { ...base.api_key, valid: false, error: message } : base.api_key,
    };
  }
}

export function renderWhoami(status) {
  const lines = ['', '  Agent Sam · whoami', ''];
  if (status.authenticated || status.loggedIn) {
    lines.push('  authenticated  yes');
    lines.push(`  authType       ${status.authLabel || status.authType || status.active_auth?.kind || 'unknown'}`);
    if (status.account?.display_name || status.identity?.email) {
      lines.push(`  account        ${status.account?.display_name || status.identity?.email}`);
    }
    if (status.account?.id || status.identity?.account_id) {
      lines.push(`  account id     ${status.account?.id || status.identity?.account_id}`);
    }
    if (status.credential?.name || status.credential?.prefix) {
      lines.push(`  credential     ${[status.credential.name, status.credential.prefix].filter(Boolean).join(' · ')}`);
    }
    if (status.tokenPermissions?.length) {
      lines.push(`  permissions    ${status.tokenPermissions.join(', ')}`);
    }
    lines.push(`  active auth    ${status.active_auth?.kind || 'unknown'} · ${status.active_auth?.source || 'runtime'}`);
  } else {
    lines.push('  authenticated  no');
    lines.push(`  API key        ${status.api_key?.configured ? status.api_key?.valid === false ? 'invalid' : 'configured' : 'not configured'}`);
    lines.push(`  browser login  ${status.browser_session?.configured ? 'stored' : 'not configured'}`);
    if (status.active_auth?.error) lines.push(`  error          ${status.active_auth.error}`);
    lines.push('');
    if (status.browser_session?.configured && status.active_auth?.error) {
      lines.push('  tip            A login session is saved locally, but the server rejected it on this');
      lines.push('                 request (see error above). Run `agentsam login` again, or');
      lines.push('                 `agentsam whoami --json` for the full response.');
    } else if (!status.api_key?.configured) {
      lines.push('  tip            Run `agentsam login` then `agentsam api-key create --store keychain --activate`.');
    }
  }

  const shadow = describeAuthShadow(status);
  if (shadow) {
    lines.push('');
    lines.push(...shadow);
  }

  lines.push('');
  lines.push('  Capabilities');
  const caps = status.capabilities || {};
  for (const [key, value] of Object.entries(caps)) {
    const available = value?.available === true ? 'yes' : 'no';
    const extra = value?.configuredProviders != null ? ` · providers ${value.configuredProviders}` : '';
    lines.push(`  ${key.padEnd(14)} ${available}${extra}`);
  }
  lines.push('');
  lines.push('  Provider credentials');
  for (const row of status.provider_credentials || []) {
    const state = row.configured ? 'available' : row.error ? `blocked (${row.error})` : 'not configured';
    const source = row.source ? ` · ${row.source}` : '';
    const label = row.provider === 'inneranimalmedia' ? 'inneranimalmedia (API key)' : String(row.provider);
    lines.push(`  ${label.padEnd(28)} ${state}${source}`);
  }
  lines.push('');
  lines.push('  Secret values are never printed by whoami.');
  lines.push('');
  return lines.join('\n');
}

/**
 * When browser OAuth exists but API key won authority — explain, don't imply login failed.
 */
export function describeAuthShadow(status = {}) {
  const browser = status.browser_session || {};
  const active = status.active_auth || {};
  const apiKey = status.api_key || {};
  if (!browser.configured) return null;
  if (active.kind === 'browser_oauth') return null;
  if (!(active.kind === 'api_key' || apiKey.configured)) return null;

  const lines = [
    '  Authority lanes',
    `  Current authoritative credential`,
    `    AgentSam API Key · ${apiKey.source || active.source || 'environment'}`,
    '',
    '  OAuth session',
    `    available${browser.expired ? ' · expired' : ''}${browser.refreshable ? ' · refreshable' : ''} but not currently authoritative`,
    '',
    '  Why?',
    '    AGENTSAM_API_KEY (or an explicit aak_* token) has higher precedence than browser OAuth.',
    '',
    '  Options',
    '    keep API key   (default — no action)',
    '    prefer session unset AGENTSAM_API_KEY && agentsam whoami',
    '    details        agentsam whoami --json',
  ];
  return lines;
}

/**
 * Post-login human summary — never claim OAuth is authoritative when API key still wins.
 */
export function renderLoginResult(status = {}) {
  const lines = ['', '  ✓ Browser OAuth login saved', ''];
  const shadow = describeAuthShadow(status);
  if (shadow) {
    lines.push('  Current authoritative credential');
    lines.push(`    AgentSam API Key · ${status.api_key?.source || status.active_auth?.source || 'environment'}`);
    lines.push('');
    lines.push('  OAuth session');
    lines.push('    available but not currently authoritative');
    lines.push('');
    lines.push('  Why?');
    lines.push('    AGENTSAM_API_KEY has higher precedence.');
    lines.push('');
    lines.push('  [enter] keep API key');
    lines.push('  [s]     use OAuth session  →  unset AGENTSAM_API_KEY && agentsam whoami');
    lines.push('  [d]     details            →  agentsam whoami --json');
    lines.push('');
  } else if (status.active_auth?.kind === 'browser_oauth') {
    lines.push('  Current authoritative credential');
    lines.push('    OAuth Session · agentsam_browser_oauth');
    lines.push('');
    lines.push('  Next');
    lines.push('    agentsam api-key create --store keychain --activate');
    lines.push('    agentsam whoami');
    lines.push('');
  } else {
    lines.push('  Current authoritative credential');
    lines.push(`    ${status.authLabel || status.active_auth?.kind || 'unknown'} · ${status.active_auth?.source || 'runtime'}`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function runWhoami(argv = [], options = {}) {
  const allowed = new Set(['--json']);
  const unknown = argv.filter((arg) => !allowed.has(arg));
  if (unknown.length) throw new Error(`unknown whoami option: ${unknown[0]}`);
  const status = await collectWhoami(options);
  const write = options.write || ((text) => process.stdout.write(text));
  if (argv.includes('--json')) writeLine(write, JSON.stringify(status, null, 2));
  else write(renderWhoami(status));
  return status;
}
