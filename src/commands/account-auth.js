import { authenticateViaBrowser } from '../lib/auth.js';
import { clearAccountSession, readAccountSession, saveAccountSession } from '../lib/account-session.js';
import { collectWhoami, renderLoginResult, renderWhoami } from './whoami.js';
import readline from 'node:readline';

function writeLine(write, value = '') { write(`${value}\n`); }

export const LOGIN_PROVIDERS = Object.freeze([
  { id: 'google', label: 'Google', aliases: ['1', 'google'] },
  { id: 'github', label: 'GitHub', aliases: ['2', 'github', 'gh'] },
  { id: 'cloudflare', label: 'Cloudflare', aliases: ['3', 'cloudflare', 'cf'] },
  { id: 'inneranimalmedia', label: 'Inner Animal Media account', aliases: ['4', 'iam', 'inneranimalmedia', 'agentsam'] },
]);

export function resolveLoginProvider(value) {
  const raw = String(value || '').trim().toLowerCase();
  return LOGIN_PROVIDERS.find((p) => p.aliases.includes(raw))?.id || null;
}

/**
 * Interactive provider picker for `agentsam login`. Provider-first: the user
 * signs in with an account they already have; Inner Animal Media is one option.
 * @returns {Promise<'google'|'github'|'cloudflare'|'inneranimalmedia'>}
 */
export async function promptLoginProvider(options = {}) {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const write = options.write || ((text) => output.write(text));

  const preset = resolveLoginProvider(options.provider);
  if (preset) return preset;

  // Non-interactive / CI: default to the AgentSam CLI OAuth client.
  if (!input?.isTTY || !output?.isTTY || options.skipPrompt === true) return 'inneranimalmedia';

  writeLine(write, '');
  writeLine(write, '  Sign in with');
  LOGIN_PROVIDERS.forEach((p, i) => writeLine(write, `    [${i + 1}] ${p.label}`));
  writeLine(write, '');

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await new Promise((resolve) => rl.question('  Choose [1-4] (default 1): ', resolve));
    const raw = String(answer || '').trim();
    if (!raw) return 'google';
    const chosen = resolveLoginProvider(raw);
    if (chosen) return chosen;
    writeLine(write, `  Unknown choice "${raw}" — using Google.`);
    return 'google';
  } finally {
    rl.close();
  }
}

export async function runLogin(argv = [], options = {}) {
  const allowed = new Set(['--json', '--provider', '--iam', '--google', '--github', '--cloudflare']);
  const unknown = argv.filter((arg) => {
    if (allowed.has(arg)) return false;
    if (arg.startsWith('--provider=')) return false;
    return true;
  });
  if (unknown.length) throw new Error(`unknown login option: ${unknown[0]}`);
  const write = options.write || ((text) => process.stdout.write(text));
  const authenticate = options.authenticateImpl || authenticateViaBrowser;

  let providerFlag = null;
  for (const arg of argv) {
    if (arg === '--iam') providerFlag = 'inneranimalmedia';
    if (arg === '--google') providerFlag = 'google';
    if (arg === '--github') providerFlag = 'github';
    if (arg === '--cloudflare') providerFlag = 'cloudflare';
    if (arg.startsWith('--provider=')) providerFlag = arg.slice('--provider='.length);
  }

  const provider = await promptLoginProvider({
    ...options,
    provider: providerFlag || options.provider,
    write,
    input: options.input,
    output: options.output,
    skipPrompt: argv.includes('--json') || options.skipPrompt === true,
  });

  if (provider === 'cloudflare') {
    // Cloudflare is a connector grant (feature packs), not an AgentSam account login.
    const { runCloudflareBrowserOAuthLogin } = await import('./cloudflare-login.js');
    return runCloudflareBrowserOAuthLogin([], { ...options, write });
  }

  const session = await authenticate({
    home: options.home,
    env: options.env || process.env,
    input: options.input,
    output: options.output,
    loginProvider: provider,
  });
  if (!String(session?.access_token || '').trim()) throw new Error('Agent Sam login did not return a browser session credential');
  // authenticateViaBrowser persists by default. Keep injected transports/test flows equivalent.
  if (!readAccountSession({ home: options.home })) saveAccountSession(session, { home: options.home });
  const status = await collectWhoami({ home: options.home, env: options.env || process.env, contextLoader: options.contextLoader });
  if (argv.includes('--json')) {
    writeLine(write, JSON.stringify({
      ...status,
      login: {
        browser_oauth_saved: true,
        provider,
        authoritative: status.active_auth?.kind || null,
        oauth_authoritative:
          status.active_auth?.kind === 'agentsam_browser_oauth'
          || status.active_auth?.kind === 'browser_oauth',
        api_key_shadows_oauth:
          Boolean(status.browser_session?.configured)
          && (status.active_auth?.kind === 'agentsam_api_key' || status.active_auth?.kind === 'api_key'),
      },
    }, null, 2));
  } else {
    write(renderLoginResult(status));
    write(renderWhoami(status));
  }
  return status;
}

export function runLogout(argv = [], options = {}) {
  const allowed = new Set(['--json']);
  const unknown = argv.filter((arg) => !allowed.has(arg));
  if (unknown.length) throw new Error(`unknown logout option: ${unknown[0]}`);
  const write = options.write || ((text) => process.stdout.write(text));
  const removed = clearAccountSession({ home: options.home });
  const result = {
    schema_version: 1,
    local_session_removed: removed,
    provider_credentials_unchanged: true,
    note: 'Local IAM session removed. Provider credentials were not deleted or revoked.',
  };
  if (argv.includes('--json')) writeLine(write, JSON.stringify(result, null, 2));
  else {
    writeLine(write, '');
    writeLine(write, removed ? '  Signed out of the local Agent Sam IAM session.' : '  No local Agent Sam IAM session was stored.');
    writeLine(write, '  Provider credentials were not deleted or revoked.');
    writeLine(write, '');
  }
  return result;
}
