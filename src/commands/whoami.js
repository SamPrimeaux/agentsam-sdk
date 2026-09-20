import { getJson } from '../lib/core-client.js';
import { resolveAccountAuthority } from '../lib/auth.js';
import {
  describeAccountSession,
  resolveAccountApiKey,
} from '../lib/account-session.js';
import { listProviderCredentialStatus } from '../lib/provider-credentials.js';

function writeLine(write, value = '') { write(`${value}\n`); }

function safeTerminalContext(value = {}) {
  return {
    available: value?.available === true,
    instances: (value?.instances || []).map((row) => ({
      id: row?.id || null,
      name: row?.name || null,
      kind: row?.kind || null,
      provider: row?.provider || null,
      status: row?.status || null,
      platform: row?.platform || null,
      arch: row?.arch || null,
      active_connection_count: Number(row?.active_connection_count || 0),
      default_connection_id: row?.default_connection_id || null,
      last_seen_at: row?.last_seen_at || null,
    })),
    connections: (value?.connections || []).map((row) => ({
      id: row?.id || null,
      instance_id: row?.instance_id || null,
      name: row?.name || null,
      kind: row?.kind || null,
      provider: row?.provider || null,
      transport: row?.transport || null,
      transport_provider: row?.transport_provider || null,
      is_active: row?.is_active === true,
      is_default: row?.is_default === true,
      health_status: row?.health_status || 'unknown',
      last_seen_at: row?.last_seen_at || null,
    })),
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
    schema_version: 2,
    authenticated: false,
    authority: 'inneranimalmedia',
    identity: null,
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
    const loader = options.contextLoader || (() => getJson('/api/sdk/context', {
      env,
      home: options.home,
      explicit: options.token || '',
      fetchImpl: options.fetchImpl,
      refreshImpl: options.refreshImpl,
      nowMs: options.nowMs,
      skewMs: options.skewMs,
      signal: options.signal,
    }));
    const context = await loader(active.value);
    return {
      ...base,
      authenticated: true,
      identity: {
        user_id: context?.user_id || null,
        account_id: context?.account_id || null,
        email: context?.email || context?.user?.email || null,
      },
      active_auth: { ...base.active_auth, valid: true, error: null },
      api_key: active.kind === 'api_key' ? { ...base.api_key, valid: true, error: null } : base.api_key,
      cloudflare_connected: context?.cloudflare?.ok === true,
      byok: context?.byok && typeof context.byok === 'object'
        ? Object.fromEntries(Object.entries(context.byok).map(([key, value]) => [key, { configured: value?.configured === true }]))
        : {},
      terminal: safeTerminalContext(context?.terminal),
    };
  } catch (error) {
    const message = error?.message || String(error);
    return {
      ...base,
      active_auth: { ...base.active_auth, valid: false, error: message },
      api_key: active.kind === 'api_key' ? { ...base.api_key, valid: false, error: message } : base.api_key,
    };
  }
}

export function renderWhoami(status) {
  const lines = ['', '  Agent Sam · whoami', ''];
  if (status.authenticated) {
    lines.push('  authenticated  yes');
    lines.push(`  authority      ${status.authority}`);
    if (status.identity?.email) lines.push(`  email          ${status.identity.email}`);
    if (status.identity?.account_id) lines.push(`  account        ${status.identity.account_id}`);
    if (status.identity?.user_id) lines.push(`  user           ${status.identity.user_id}`);
    lines.push(`  active auth    ${status.active_auth?.kind || 'unknown'} · ${status.active_auth?.source || 'runtime'}`);
  } else {
    lines.push('  authenticated  no');
    lines.push(`  API key        ${status.api_key?.configured ? status.api_key?.valid === false ? 'invalid' : 'configured' : 'not configured'}`);
    lines.push(`  browser login  ${status.browser_session?.configured ? 'stored' : 'not configured'}`);
    if (status.active_auth?.error) lines.push(`  error          ${status.active_auth.error}`);
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
