import { getJson } from '../lib/core-client.js';
import {
  describeAccountSession,
  resolveAccountApiKey,
  resolveAccountAuth,
} from '../lib/account-session.js';
import { listProviderCredentialStatus } from '../lib/provider-credentials.js';

function writeLine(write, value = '') { write(`${value}\n`); }

export async function collectWhoami(options = {}) {
  const env = options.env || process.env;
  const apiKey = resolveAccountApiKey({ env, explicit: options.token || '', home: options.home });
  const browserSession = describeAccountSession({ env, home: options.home });
  const active = resolveAccountAuth({ env, explicit: options.token || '', home: options.home });
  const credentials = listProviderCredentialStatus({ env, home: options.home });

  const base = {
    schema_version: 2,
    authenticated: false,
    authority: 'iam',
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
    const loader = options.contextLoader || ((token) => getJson('/api/sdk/context', token));
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
    lines.push(`  ${String(row.provider).padEnd(16)} ${state}${source}`);
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
