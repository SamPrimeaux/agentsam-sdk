import {
  cancel,
  confirm,
  intro,
  isCancel,
  multiselect,
  outro,
  password,
  spinner,
  text,
} from '@clack/prompts';
import { getJson } from '../lib/core-client.js';
import {
  PROVIDER_CREDENTIALS,
  describeProviderCredential,
  listProviderCredentialStatus,
  normalizeProviderId,
  providerCredentialSpec,
  removeProviderCredential,
  resolveProviderCredential,
  setProviderCredential,
} from '../lib/provider-credentials.js';
import { discoverProviderModels } from '../models/discovery.js';

const PROVIDER_ORDER = Object.freeze([
  'openai',
  'anthropic',
  'gemini',
  'cursor',
  'xai',
  'cloudflare',
  'inneranimalmedia',
]);

function clean(value) { return value == null ? '' : String(value).trim(); }
function writeLine(write, value = '') { write(`${value}\n`); }

export function providerChoices(options = {}) {
  const statuses = new Map(listProviderCredentialStatus(options).map((row) => [row.provider, row]));
  return PROVIDER_ORDER.map((provider) => {
    const spec = providerCredentialSpec(provider);
    const status = statuses.get(provider);
    return {
      value: provider,
      label: spec?.label || provider,
      hint: status?.configured
        ? `configured · ${status.source || 'runtime'}`
        : status?.error ? `blocked · ${status.error}` : spec?.env || '',
    };
  });
}

async function verifyInnerAnimalMedia(credential, options = {}) {
  if (!credential?.configured || !credential?.value) {
    return { attempted: false, ok: false, error: credential?.error || 'credential unavailable', models: [] };
  }
  try {
    const loader = options.iamContextLoader || ((token) => getJson('/api/sdk/context', token));
    const context = await loader(credential.value);
    return {
      attempted: true,
      ok: true,
      error: null,
      models: [],
      identity: {
        user_id: context?.user_id || null,
        account_id: context?.account_id || null,
        email: context?.email || context?.user?.email || null,
      },
    };
  } catch (error) {
    return { attempted: true, ok: false, error: error?.message || String(error), models: [] };
  }
}

export async function verifyProviderCredential(provider, options = {}) {
  const id = normalizeProviderId(provider);
  const credential = resolveProviderCredential(id, options);
  if (id === 'inneranimalmedia') return verifyInnerAnimalMedia(credential, options);
  if (!credential.configured) {
    return { attempted: false, ok: false, error: credential.error || 'credential unavailable', models: [] };
  }
  return discoverProviderModels(id, credential, { fetchImpl: options.fetchImpl || fetch });
}

export async function collectProviderStatus(options = {}) {
  const rows = listProviderCredentialStatus(options);
  if (options.verify !== true) {
    return rows.map((row) => ({ ...row, verification: null }));
  }
  const verified = await Promise.all(rows.map(async (row) => {
    if (!row.configured) return { ...row, verification: null };
    const verification = await verifyProviderCredential(row.provider, options);
    return {
      ...row,
      verification: {
        attempted: verification.attempted === true,
        ok: verification.ok === true,
        error: verification.error || null,
        model_count: Array.isArray(verification.models) ? verification.models.length : 0,
      },
    };
  }));
  return verified;
}

export function renderProviderStatus(rows = []) {
  const lines = ['', '  Agent Sam · providers', ''];
  for (const row of rows) {
    const state = row.configured ? 'configured' : row.error ? `blocked (${row.error})` : 'not configured';
    let verification = '';
    if (row.verification) {
      verification = row.verification.ok
        ? ` · verified${row.verification.model_count ? ` · ${row.verification.model_count} models` : ''}`
        : ` · verify failed: ${row.verification.error || 'unknown'}`;
    }
    lines.push(`  ${String(row.label || row.provider).padEnd(18)} ${state}${verification}`);
  }
  lines.push('');
  lines.push('  Profiles: ~/.agentsam/env.d/<provider>.env · mode 0600');
  lines.push('  Load one or many: source ~/.agentsam/load-agent-env.sh openai gemini cursor');
  lines.push('');
  return lines.join('\n');
}

async function promptProviderCredential(provider, options = {}) {
  const spec = providerCredentialSpec(provider);
  if (!spec) throw new Error(`unsupported_provider:${provider}`);
  const promptPassword = options.passwordImpl || password;
  const promptText = options.textImpl || text;
  const secret = await promptPassword({
    message: `${spec.label} · ${spec.env}`,
    mask: '•',
    validate(value) {
      const trimmed = clean(value);
      if (!trimmed) return 'Credential is required';
      if (spec.tokenPrefix && !trimmed.startsWith(spec.tokenPrefix)) return `Expected ${spec.tokenPrefix}…`;
    },
  });
  if (isCancel(secret)) return null;

  let accountId = '';
  if (provider === 'cloudflare') {
    const answer = await promptText({
      message: 'Cloudflare account ID',
      placeholder: '32-character account ID',
      validate(value) {
        const id = clean(value);
        if (!id) return 'Cloudflare account ID is required';
        if (!/^[a-f0-9]{32}$/i.test(id)) return 'Expected a 32-character hexadecimal account ID';
      },
    });
    if (isCancel(answer)) return null;
    accountId = clean(answer);
  }

  setProviderCredential(provider, String(secret), { ...options, accountId });
  return verifyProviderCredential(provider, options);
}

async function runInteractiveProviders(options = {}) {
  const promptMultiselect = options.multiselectImpl || multiselect;
  const selected = await promptMultiselect({
    message: 'Providers to configure',
    required: false,
    options: providerChoices(options),
  });
  if (isCancel(selected)) {
    cancel('Provider setup cancelled.');
    return collectProviderStatus(options);
  }
  if (!selected.length) return collectProviderStatus(options);

  intro('Agent Sam provider setup');
  const spin = options.spinnerImpl ? options.spinnerImpl() : spinner();
  for (const provider of selected) {
    const result = await promptProviderCredential(provider, options);
    if (!result) continue;
    spin.start(`Verifying ${providerCredentialSpec(provider)?.label || provider}`);
    if (result.ok) {
      const suffix = result.models?.length ? ` · ${result.models.length} models` : '';
      spin.stop(`Verified${suffix}`);
    } else {
      spin.stop(`Saved · verification failed: ${result.error || 'unknown'}`, 1);
    }
  }
  outro('Provider setup complete');
  return collectProviderStatus(options);
}

function parseArgs(argv = []) {
  const out = { command: 'interactive', provider: '', json: false, verify: false, yes: false, fromEnv: '' };
  const args = [...argv];
  if (args[0] && !args[0].startsWith('-')) out.command = args.shift();
  if (['add', 'set', 'remove', 'verify', 'status'].includes(out.command) && args[0] && !args[0].startsWith('-')) {
    out.provider = normalizeProviderId(args.shift());
  }
  while (args.length) {
    const arg = args.shift();
    if (arg === '--json') out.json = true;
    else if (arg === '--verify') out.verify = true;
    else if (arg === '--yes' || arg === '-y') out.yes = true;
    else if (arg === '--from-env') out.fromEnv = clean(args.shift());
    else if (arg === '--help' || arg === '-h') out.command = 'help';
    else throw new Error(`unknown providers option: ${arg}`);
  }
  return out;
}

export async function runProviders(argv = [], options = {}) {
  const write = options.write || ((value) => process.stdout.write(value));
  const parsed = parseArgs(argv);

  if (parsed.command === 'help') {
    write([
      'agentsam providers',
      'agentsam providers status [provider] [--verify] [--json]',
      'agentsam providers add <provider> [--from-env NAME]',
      'agentsam providers verify [provider] [--json]',
      'agentsam providers remove <provider> [--yes]',
      '',
      `Providers: ${PROVIDER_ORDER.join(', ')}`,
      '',
    ].join('\n'));
    return;
  }

  if (parsed.command === 'interactive') {
    if (options.interactive === false || !(options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY))) {
      const rows = await collectProviderStatus({ ...options, verify: false });
      write(renderProviderStatus(rows));
      return rows;
    }
    const rows = await runInteractiveProviders(options);
    write(renderProviderStatus(rows));
    return rows;
  }

  if (parsed.provider && !providerCredentialSpec(parsed.provider)) throw new Error(`unsupported_provider:${parsed.provider}`);

  if (parsed.command === 'status') {
    let rows = await collectProviderStatus({ ...options, verify: parsed.verify });
    if (parsed.provider) rows = rows.filter((row) => row.provider === parsed.provider);
    if (parsed.json) writeLine(write, JSON.stringify(rows, null, 2));
    else write(renderProviderStatus(rows));
    return rows;
  }

  if (parsed.command === 'verify') {
    const providers = parsed.provider
      ? [parsed.provider]
      : Object.keys(PROVIDER_CREDENTIALS).filter((provider) => describeProviderCredential(provider, options).configured);
    const results = [];
    for (const provider of providers) {
      const result = await verifyProviderCredential(provider, options);
      results.push({
        provider,
        ok: result.ok === true,
        error: result.error || null,
        model_count: Array.isArray(result.models) ? result.models.length : 0,
      });
    }
    if (parsed.json) writeLine(write, JSON.stringify(results, null, 2));
    else {
      writeLine(write, '');
      for (const row of results) {
        writeLine(write, `  ${row.provider.padEnd(18)} ${row.ok ? `verified${row.model_count ? ` · ${row.model_count} models` : ''}` : `failed · ${row.error}`}`);
      }
      writeLine(write, '');
    }
    return results;
  }

  if (parsed.command === 'add' || parsed.command === 'set') {
    if (!parsed.provider) throw new Error('providers add requires a provider');
    if (parsed.fromEnv) {
      const value = clean((options.env || process.env)[parsed.fromEnv]);
      if (!value) throw new Error(`environment credential missing: ${parsed.fromEnv}`);
      setProviderCredential(parsed.provider, value, options);
      return verifyProviderCredential(parsed.provider, options);
    }
    if (options.interactive === false || !(options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY))) {
      throw new Error('providers add requires an interactive terminal or --from-env NAME');
    }
    const result = await promptProviderCredential(parsed.provider, options);
    if (!result) return null;
    writeLine(write, result.ok ? `  ${parsed.provider} verified` : `  ${parsed.provider} saved · verification failed: ${result.error}`);
    return result;
  }

  if (parsed.command === 'remove') {
    if (!parsed.provider) throw new Error('providers remove requires a provider');
    let approved = parsed.yes;
    if (!approved) {
      if (options.interactive === false || !(options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY))) {
        throw new Error('providers remove requires --yes in non-interactive mode');
      }
      const answer = await (options.confirmImpl || confirm)({ message: `Remove ${providerCredentialSpec(parsed.provider)?.label} credential profile from this machine?` });
      approved = !isCancel(answer) && answer === true;
    }
    if (!approved) return { provider: parsed.provider, removed: false };
    const result = removeProviderCredential(parsed.provider, options);
    writeLine(write, result.removed ? `  removed ${parsed.provider}` : `  ${parsed.provider} was not configured`);
    return result;
  }

  throw new Error(`unknown providers command: ${parsed.command}`);
}
