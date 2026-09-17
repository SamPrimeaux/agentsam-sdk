import { spawnSync } from 'node:child_process';
import { describeProviderCredential, ensureProviderEnvProfile, providerCredentialSpec } from '../lib/provider-credentials.js';

const PROVIDERS = Object.freeze(['openai', 'anthropic', 'gemini', 'grok', 'cloudflare']);

function writeLine(write, value = '') { write(`${value}\n`); }

function detectCloudflareAccounts(options = {}) {
  const env = options.env || process.env;
  const explicit = String(options.accountId || env.ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (explicit) return { accounts: [{ id: explicit, name: null }], source: 'environment' };
  const spawn = options.spawnSyncImpl || spawnSync;
  const result = spawn('npx', ['--no-install', 'wrangler', 'whoami', '--json'], { cwd: options.cwd || process.cwd(), env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result?.status !== 0) return { accounts: [], source: 'wrangler', error: String(result?.stderr || '').trim() || `wrangler exited ${result?.status ?? 'unknown'}` };
  try {
    const parsed = JSON.parse(String(result.stdout || '{}'));
    const accounts = (Array.isArray(parsed?.accounts) ? parsed.accounts : []).map((row) => ({
      id: String(row?.id || row?.account_id || '').trim(),
      name: String(row?.name || row?.account_name || '').trim() || null,
    })).filter((row) => row.id);
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

export async function runEnv(argv = [], options = {}) {
  const write = options.write || ((text) => process.stdout.write(text));
  const [command = 'status', providerArg] = argv;
  let accountId = '';
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--account-id') accountId = String(argv[++i] || '').trim();
    else throw new Error(`unexpected env argument: ${argv[i]}`);
  }
  if (command === '--help' || command === '-h' || command === 'help') {
    writeLine(write, 'agentsam env init <openai|anthropic|gemini|grok|cloudflare> [--account-id <id>]');
    writeLine(write, 'agentsam env status [provider]');
    return;
  }
  if (command === 'init') {
    const provider = String(providerArg || '').trim().toLowerCase();
    if (!PROVIDERS.includes(provider)) throw new Error(`env init requires one of: ${PROVIDERS.join(', ')}`);
    let cloudflareAccounts = null;
    if (provider === 'cloudflare') {
      if (accountId && !/^[a-f0-9]{32}$/i.test(accountId)) throw new Error('Cloudflare --account-id must be a 32-character hexadecimal account ID');
      cloudflareAccounts = detectCloudflareAccounts({ ...options, accountId });
      if (!accountId && cloudflareAccounts.accounts.length === 1) accountId = cloudflareAccounts.accounts[0].id;
    }
    const result = ensureProviderEnvProfile(provider, { ...options, accountId });
    writeLine(write, '');
    writeLine(write, `  AgentSam · ${provider} environment`);
    writeLine(write, `  profile  ${result.file}${result.created ? ' · created' : ' · existing'}`);
    writeLine(write, `  loader   ${result.loader}`);
    writeLine(write, '');
    writeLine(write, '  Add the credential to the profile, then load it into this shell:');
    writeLine(write, `    ${result.source_command}`);
    if (provider === 'cloudflare') {
      if (accountId) writeLine(write, `  account  detected/configured (${cloudflareAccounts?.source || 'explicit'})`);
      else if ((cloudflareAccounts?.accounts || []).length > 1) writeLine(write, `  account  ${cloudflareAccounts.accounts.length} Wrangler accounts found · rerun with --account-id <id>`);
      else writeLine(write, '  account  not detected · set ACCOUNT_ID in the profile or rerun with --account-id <id>');
      cloudflareGuidance(write);
    }
    writeLine(write, '');
    return result;
  }
  if (command === 'status') {
    const providers = providerArg ? [String(providerArg).trim().toLowerCase()] : PROVIDERS;
    for (const provider of providers) if (!providerCredentialSpec(provider)) throw new Error(`unsupported_provider:${provider}`);
    writeLine(write, '');
    writeLine(write, '  AgentSam · provider environments');
    for (const provider of providers) {
      const row = describeProviderCredential(provider, options);
      const extra = row.account_id ? ` · account ${row.account_id}` : '';
      writeLine(write, `  ${provider.padEnd(12)} ${row.configured ? 'configured' : row.error ? `blocked (${row.error})` : 'not configured'}${extra}`);
    }
    writeLine(write, '');
    return;
  }
  throw new Error(`unknown env command: ${command}`);
}
