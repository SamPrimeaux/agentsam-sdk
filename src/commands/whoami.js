import { getJson } from '../lib/core-client.js';
import { resolveAccountSdkKey } from '../lib/account-session.js';
import { listProviderCredentialStatus } from '../lib/provider-credentials.js';

function writeLine(write, value = '') { write(`${value}\n`); }

export async function collectWhoami(options = {}) {
  const env = options.env || process.env;
  const sdk = resolveAccountSdkKey({ env, explicit: options.token || '', home: options.home });
  const token = sdk.value;
  const credentials = listProviderCredentialStatus({ env, home: options.home });
  if (!token) return {
    schema_version: 1,
    authenticated: false,
    authority: 'iam',
    identity: null,
    sdk_credential: { configured: false, source: null },
    provider_credentials: credentials,
  };
  try {
    const loader = options.contextLoader || ((sdkKey) => getJson('/api/sdk/context', sdkKey));
    const context = await loader(token);
    return {
      schema_version: 1,
      authenticated: true,
      authority: 'iam',
      identity: {
        user_id: context?.user_id || null,
        account_id: context?.account_id || null,
        email: context?.email || context?.user?.email || null,
      },
      sdk_credential: { configured: true, source: sdk.source, valid: true },
      provider_credentials: credentials,
      cloudflare_connected: context?.cloudflare?.ok === true,
      byok: context?.byok && typeof context.byok === 'object'
        ? Object.fromEntries(Object.entries(context.byok).map(([key, value]) => [key, { configured: value?.configured === true }]))
        : {},
    };
  } catch (error) {
    return {
      schema_version: 1,
      authenticated: false,
      authority: 'iam',
      identity: null,
      sdk_credential: { configured: true, source: sdk.source, valid: false, error: error?.message || String(error) },
      provider_credentials: credentials,
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
  } else {
    lines.push('  authenticated  no');
    lines.push(`  SDK key        ${status.sdk_credential?.configured ? 'present but not validated' : 'not configured'}`);
    if (status.sdk_credential?.error) lines.push(`  error          ${status.sdk_credential.error}`);
  }
  lines.push('');
  lines.push('  Provider credentials');
  for (const row of status.provider_credentials || []) {
    const state = row.configured ? 'available' : row.error ? `blocked (${row.error})` : 'not configured';
    const source = row.source ? ` · ${row.source}` : '';
    lines.push(`  ${String(row.provider).padEnd(12)} ${state}${source}`);
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
