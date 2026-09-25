import {
  cancel,
  confirm,
  intro,
  isCancel,
  multiselect,
  outro,
  password,
  select,
  spinner,
  text,
} from '@clack/prompts';
import { getJson } from '../lib/core-client.js';
import {
  PROVIDER_CREDENTIALS,
  describeProviderCredential,
  exportProviderEnvProfile,
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
  lines.push('  Storage: Encrypted local vault (AES-256-GCM / OS keychain) — no plaintext on disk.');
  lines.push('  Optional export for non-AgentSam shells: agentsam providers export <provider>');
  lines.push('');
  return lines.join('\n');
}

export async function validateAndSaveProviderCredential(provider, secret, options = {}) {
  const id = normalizeProviderId(provider);
  const spec = providerCredentialSpec(id);
  if (!spec) throw new Error(`unsupported_provider:${id}`);
  const cleanSecret = clean(secret);
  if (!cleanSecret) return { attempted: false, ok: false, error: 'Credential is required', models: [] };
  if (spec.tokenPrefix && !cleanSecret.startsWith(spec.tokenPrefix)) {
    return { attempted: false, ok: false, error: `Expected ${spec.tokenPrefix}…`, models: [] };
  }

  const accountId = clean(options.accountId);
  if (id === 'cloudflare' && !accountId) {
    return { attempted: false, ok: false, error: 'Cloudflare account ID is required', models: [] };
  }

  const tempCredential = {
    provider: id,
    configured: true,
    value: cleanSecret,
    account_id: accountId || null,
  };

  let verification;
  if (id === 'inneranimalmedia') {
    verification = await verifyInnerAnimalMedia(tempCredential, options);
  } else {
    verification = await discoverProviderModels(id, tempCredential, { fetchImpl: options.fetchImpl || fetch });
  }

  if (!verification.ok) {
    return {
      attempted: true,
      ok: false,
      error: verification.error || 'Provider verification failed',
      models: [],
      saved: false,
    };
  }

  // Key is verified! Now persist securely to OS store + AES-256-GCM vault.
  // Also write ~/.agentsam/env.d so `source load-agent-env.sh` works on boot.
  setProviderCredential(id, cleanSecret, {
    ...options,
    accountId,
    writeEnvProfile: options.writeEnvProfile !== false,
  });

  return {
    attempted: true,
    ok: true,
    error: null,
    models: verification.models || [],
    model_count: verification.models?.length || 0,
    identity: verification.identity || null,
    saved: true,
  };
}

export async function promptAndConfigureProvider(provider, options = {}) {
  const id = normalizeProviderId(provider);
  const spec = providerCredentialSpec(id);
  if (!spec) throw new Error(`unsupported_provider:${id}`);
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
  if (id === 'cloudflare') {
    const answer = await promptText({
      message: 'Cloudflare account ID',
      placeholder: '32-character account ID',
      validate(value) {
        const val = clean(value);
        if (!val) return 'Cloudflare account ID is required';
        if (!/^[a-f0-9]{32}$/i.test(val)) return 'Expected a 32-character hexadecimal account ID';
      },
    });
    if (isCancel(answer)) return null;
    accountId = clean(answer);
  }

  const spin = options.spinnerImpl ? options.spinnerImpl() : spinner();
  spin.start(`Verifying ${spec.label} API credential`);

  const result = await validateAndSaveProviderCredential(id, String(secret), {
    ...options,
    accountId,
    writeEnvProfile: options.writeEnvProfile !== false,
  });

  if (!result.ok) {
    spin.stop(`Verification failed: ${result.error || 'invalid key'} · Key was NOT saved`, 1);
    return { ...result, saved: false };
  }

  const count = result.models?.length || 0;
  const suffix = count ? ` · ${count} models visible` : '';
  spin.stop(`Verified${suffix} · saved securely to local vault`);

  return { ...result, saved: true };
}

async function runInteractiveProviders(options = {}) {
  const promptSelect = options.selectImpl || select;

  intro('Agent Sam provider setup');

  while (true) {
    const choices = [
      ...providerChoices(options),
      { value: '__done__', label: 'Done / Return to shell', hint: 'finish provider setup' },
    ];

    const choice = await promptSelect({
      message: 'Select your preferred provider to continue',
      options: choices,
    });

    if (isCancel(choice) || choice === '__done__') {
      break;
    }

    await promptAndConfigureProvider(choice, options);
  }

  outro('Provider setup complete');
  return collectProviderStatus(options);
}

function parseArgs(argv = []) {
  const out = {
    command: 'interactive',
    provider: '',
    json: false,
    verify: false,
    yes: false,
    fromEnv: '',
    fromStdin: false,
    exportProfile: true,
  };
  const args = [...argv];
  if (args[0] && !args[0].startsWith('-')) out.command = args.shift();
  if (['add', 'set', 'remove', 'verify', 'status', 'export', 'roll'].includes(out.command) && args[0] && !args[0].startsWith('-')) {
    out.provider = normalizeProviderId(args.shift());
  }
  while (args.length) {
    const arg = args.shift();
    if (arg === '--json') out.json = true;
    else if (arg === '--verify') out.verify = true;
    else if (arg === '--yes' || arg === '-y') out.yes = true;
    else if (arg === '--from-env') out.fromEnv = clean(args.shift());
    else if (arg === '--from-stdin') out.fromStdin = true;
    else if (arg === '--no-export') out.exportProfile = false;
    else if (arg === '--export') out.exportProfile = true;
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
      'agentsam providers add <provider> [--from-env NAME|--from-stdin] [--no-export]',
      'agentsam providers roll <provider> [--from-env NAME|--from-stdin]   replace + export env.d',
      'agentsam providers export <provider>',
      'agentsam providers verify [provider] [--json]',
      'agentsam providers remove <provider> [--yes]',
      '',
      `Providers: ${PROVIDER_ORDER.join(', ')}`,
      '',
      'Boot load: source ~/.agentsam/load-agent-env.sh <provider…>',
      '           agentsam env boot-line',
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

  if (parsed.command === 'add' || parsed.command === 'set' || parsed.command === 'roll') {
    if (!parsed.provider) throw new Error('providers add requires a provider');
    if (parsed.command === 'roll') {
      removeProviderCredential(parsed.provider, options);
    }
    let secretValue = '';
    if (parsed.fromStdin) {
      const chunks = [];
      for await (const chunk of options.stdin || process.stdin) chunks.push(chunk);
      secretValue = Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))).toString('utf8').trim();
      if (!secretValue) throw new Error('stdin credential missing');
    } else if (parsed.fromEnv) {
      secretValue = clean((options.env || process.env)[parsed.fromEnv]);
      if (!secretValue) throw new Error(`environment credential missing: ${parsed.fromEnv}`);
    }
    if (secretValue) {
      const verified = await validateAndSaveProviderCredential(parsed.provider, secretValue, {
        ...options,
        writeEnvProfile: parsed.exportProfile,
      });
      if (!verified.ok) {
        throw new Error(`Provider verification failed: ${verified.error}. Credential was not saved.`);
      }
      writeLine(write, `  ${parsed.provider} verified · saved${parsed.exportProfile ? ' · env.d exported' : ''}`);
      if (parsed.exportProfile) {
        writeLine(write, `  source ~/.agentsam/load-agent-env.sh ${parsed.provider}`);
      }
      return verified;
    }
    if (options.interactive === false || !(options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY))) {
      throw new Error('providers add requires an interactive terminal, --from-env NAME, or --from-stdin');
    }
    const result = await promptAndConfigureProvider(parsed.provider, {
      ...options,
      writeEnvProfile: parsed.exportProfile,
    });
    if (!result) return null;
    writeLine(write, result.ok ? `  ${parsed.provider} verified` : `  ${parsed.provider} verification failed: ${result.error}`);
    if (result.ok && parsed.exportProfile) {
      writeLine(write, `  source ~/.agentsam/load-agent-env.sh ${parsed.provider}`);
    }
    return result;
  }

  if (parsed.command === 'export') {
    if (!parsed.provider) throw new Error('providers export requires a provider');
    const result = exportProviderEnvProfile(parsed.provider, options);
    writeLine(write, '');
    writeLine(write, `  Exported ${parsed.provider} profile: ${result.file} (mode 0600)`);
    writeLine(write, `  Load into external shell: ${result.source_command}`);
    writeLine(write, '');
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
