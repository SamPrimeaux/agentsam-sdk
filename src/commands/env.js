import { spawnSync } from 'node:child_process';
import {
  describeProviderCredential,
  ensureProviderEnvProfile,
  exportProviderEnvProfile,
  providerCredentialSpec,
  listProviderCredentialStatus,
  ensureAgentEnvLoader,
  agentEnvLoaderPath,
} from '../lib/provider-credentials.js';

const PROVIDERS = Object.freeze([
  'openai',
  'anthropic',
  'gemini',
  'grok',
  'xai',
  'cursor',
  'cloudflare',
  'inneranimalmedia',
]);

const PROVIDER_ALIASES = Object.freeze({
  grok: 'xai',
  iam: 'inneranimalmedia',
  agentsam: 'inneranimalmedia',
  'agentsam-api': 'inneranimalmedia',
});

function writeLine(write, value = '') {
  write(`${value}\n`);
}

function normalizeEnvProvider(raw) {
  const id = String(raw || '')
    .trim()
    .toLowerCase();
  return PROVIDER_ALIASES[id] || id;
}

export function detectCloudflareAccounts(options = {}) {
  const env = options.env || process.env;
  const explicit = String(options.accountId || env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (explicit) return { accounts: [{ id: explicit, name: null }], source: 'environment' };
  const spawn = options.spawnSyncImpl || spawnSync;
  const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawn(npxBin, ['--no-install', 'wrangler', 'whoami', '--json'], {
    cwd: options.cwd || process.cwd(),
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  if (result?.status !== 0) {
    return {
      accounts: [],
      source: 'wrangler',
      error: String(result?.stderr || '').trim() || `wrangler exited ${result?.status ?? 'unknown'}`,
    };
  }
  try {
    const parsed = JSON.parse(String(result.stdout || '{}'));
    const accounts = (Array.isArray(parsed?.accounts) ? parsed.accounts : [])
      .map((row) => ({
        id: String(row?.id || row?.account_id || '').trim(),
        name: String(row?.name || row?.account_name || '').trim() || null,
      }))
      .filter((row) => row.id);
    return { accounts, source: 'wrangler', error: null };
  } catch (error) {
    return { accounts: [], source: 'wrangler', error: `invalid wrangler JSON: ${error?.message || error}` };
  }
}

function cloudflareGuidance(write) {
  writeLine(write, '');
  writeLine(write, '  Cloudflare token guidance');
  writeLine(write, '  models only       Workers AI Read');
  writeLine(write, '  run Workers AI    Workers AI Read + Edit');
  writeLine(write, '  deploy Workers    Workers Editor for existing Workers; Admin only when create/delete is required');
  writeLine(write, '  routes/domains    add Workers Routes Write only when AgentSam must change them');
  writeLine(write, '  D1 / R2 / KV      add direct product permissions only when AgentSam must read/write those resources directly');
}

function agentsamApiGuidance(write) {
  writeLine(write, '');
  writeLine(write, '  AGENTSAM_API_KEY (aak_*)');
  writeLine(write, '  Mint/rotate on the host account credentials surface (hash-only in D1).');
  writeLine(write, '  Then pipe into this machine (never commit the raw key):');
  writeLine(write, '    printf \'%s\' "$AAK" | agentsam providers add inneranimalmedia --from-stdin');
  writeLine(write, '  Boot load:');
  writeLine(write, '    source ~/.agentsam/load-agent-env.sh inneranimalmedia');
}

function cursorGuidance(write) {
  writeLine(write, '');
  writeLine(write, '  CURSOR_API_KEY roll');
  writeLine(write, '  1. Create a new key in Cursor dashboard');
  writeLine(write, '  2. printf \'%s\' "$NEW" | agentsam providers add cursor --from-stdin');
  writeLine(write, '  3. source ~/.agentsam/load-agent-env.sh cursor');
  writeLine(write, '  4. If Local Studio Worker uses the secret: wrangler secret put CURSOR_API_KEY');
  writeLine(write, '  Optional: agentsam providers remove cursor --yes  (before add, to force replace)');
}

export async function runEnv(argv = [], options = {}) {
  const write = options.write || ((text) => process.stdout.write(text));
  const [command = 'status', ...args] = argv;
  let accountId = '';
  const positionals = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--account-id') accountId = String(args[++i] || '').trim();
    else if (String(args[i] || '').startsWith('-')) throw new Error(`unexpected env argument: ${args[i]}`);
    else positionals.push(args[i]);
  }
  const providerArg = positionals[0];

  if (command === '--help' || command === '-h' || command === 'help') {
    writeLine(write, 'agentsam env init <openai|anthropic|gemini|grok|cursor|cloudflare|inneranimalmedia> [--account-id <id>]');
    writeLine(write, 'agentsam env status [provider]');
    writeLine(write, 'agentsam env export <provider>     write ~/.agentsam/env.d from vault');
    writeLine(write, 'agentsam env boot-line [providers…]  print source line for shell profile');
    return;
  }

  if (command === 'boot-line') {
    const wanted = positionals.map(normalizeEnvProvider).filter(Boolean);
    const profiles =
      wanted.length > 0
        ? wanted
        : listProviderCredentialStatus(options)
            .filter((r) => r.configured)
            .map((r) => r.provider);
    ensureAgentEnvLoader(options);
    const loader = agentEnvLoaderPath(options).replace(String(options.home || process.env.HOME || ''), '~');
    const list = profiles.length ? profiles.join(' ') : 'openai cursor inneranimalmedia';
    writeLine(write, `source ~/.agentsam/load-agent-env.sh ${list}`);
    writeLine(write, `# loader: ${loader}`);
    return { command: `source ~/.agentsam/load-agent-env.sh ${list}` };
  }

  if (command === 'export') {
    const provider = normalizeEnvProvider(providerArg);
    if (!providerCredentialSpec(provider)) throw new Error(`unsupported_provider:${provider}`);
    const result = exportProviderEnvProfile(provider, options);
    writeLine(write, '');
    writeLine(write, `  Exported ${provider}: ${result.file}`);
    writeLine(write, `  ${result.source_command}`);
    writeLine(write, '');
    return result;
  }

  if (command === 'init') {
    const provider = normalizeEnvProvider(providerArg);
    if (!PROVIDERS.includes(provider) && provider !== 'xai') {
      throw new Error(`env init requires one of: ${PROVIDERS.join(', ')}`);
    }
    let cloudflareAccounts = null;
    if (provider === 'cloudflare') {
      if (accountId && !/^[a-f0-9]{32}$/i.test(accountId)) {
        throw new Error('Cloudflare --account-id must be a 32-character hexadecimal account ID');
      }
      cloudflareAccounts = detectCloudflareAccounts({ ...options, accountId });
      if (!accountId && cloudflareAccounts.accounts.length === 1) accountId = cloudflareAccounts.accounts[0].id;
    }
    const result = ensureProviderEnvProfile(provider, { ...options, accountId });
    writeLine(write, '');
    writeLine(write, `  AgentSam · ${provider} environment`);
    writeLine(write, `  profile  ${result.file}${result.created ? ' · created' : ' · existing'}`);
    writeLine(write, `  loader   ${result.loader}`);
    writeLine(write, '');
    writeLine(write, '  Add the credential to the profile (or use providers add --from-stdin), then:');
    writeLine(write, `    ${result.source_command}`);
    if (provider === 'cloudflare') {
      if (accountId) writeLine(write, `  account  detected/configured (${cloudflareAccounts?.source || 'explicit'})`);
      else if ((cloudflareAccounts?.accounts || []).length > 1) {
        writeLine(write, `  account  ${cloudflareAccounts.accounts.length} Wrangler accounts found · rerun with --account-id <id>`);
      } else {
        writeLine(write, '  account  not detected · set CLOUDFLARE_ACCOUNT_ID in the profile or rerun with --account-id <id>');
      }
      cloudflareGuidance(write);
    }
    if (provider === 'inneranimalmedia') agentsamApiGuidance(write);
    if (provider === 'cursor') cursorGuidance(write);
    writeLine(write, '');
    return result;
  }

  if (command === 'status') {
    const providers = providerArg
      ? [normalizeEnvProvider(providerArg)]
      : PROVIDERS.filter((p) => p !== 'grok');
    for (const provider of providers) {
      if (!providerCredentialSpec(provider)) throw new Error(`unsupported_provider:${provider}`);
    }
    writeLine(write, '');
    writeLine(write, '  AgentSam · provider environments');
    for (const provider of providers) {
      const row = describeProviderCredential(provider, options);
      const extra = row.account_id ? ` · account ${row.account_id}` : '';
      writeLine(
        write,
        `  ${provider.padEnd(16)} ${row.configured ? 'configured' : row.error ? `blocked (${row.error})` : 'not configured'}${extra}`,
      );
    }
    writeLine(write, '');
    writeLine(write, '  Boot tip: agentsam env boot-line');
    writeLine(write, '');
    return;
  }

  throw new Error(`unknown env command: ${command}`);
}
