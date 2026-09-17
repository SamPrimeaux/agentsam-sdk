import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROVIDER_CREDENTIALS = Object.freeze({
  openai: Object.freeze({ env: 'OPENAI_API_KEY', files: ['openai.env'] }),
  gemini: Object.freeze({ env: 'GEMINI_API_KEY', files: ['gemini.env'] }),
  anthropic: Object.freeze({ env: 'ANTHROPIC_API_KEY', files: ['anthropic.env'] }),
  grok: Object.freeze({ env: 'XAI_API_KEY', files: ['grok.env', 'xai.env'] }),
  cloudflare: Object.freeze({ env: 'CLOUDFLARE_API_TOKEN', files: ['cloudflare.env'], accountEnv: ['ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID'] }),
});

function clean(value) { return value == null ? '' : String(value).trim(); }
function normalizeCloudflareAccountId(value) {
  const id = clean(value);
  if (!id) return '';
  if (!/^[a-f0-9]{32}$/i.test(id)) throw new Error('invalid_cloudflare_account_id');
  return id;
}

function homeDirectory(options = {}) {
  return path.resolve(clean(options.home) || clean(options.env?.HOME) || clean(options.env?.USERPROFILE) || os.homedir());
}

function parseEnvValue(source, variable) {
  for (const rawLine of String(source || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || match[1] !== variable) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return value;
  }
  return '';
}

function secureFile(filename) {
  const stat = fs.statSync(filename);
  if (!stat.isFile()) return { ok: false, error: 'not_a_file' };
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) return { ok: false, error: 'permissions_too_open' };
  return { ok: true, mode: stat.mode & 0o777 };
}

function firstEnvValue(source, names = []) {
  for (const name of names) {
    const value = clean(parseEnvValue(source, name));
    if (value) return value;
  }
  return '';
}

function firstRuntimeValue(env, names = []) {
  for (const name of names) {
    const value = clean(env?.[name]);
    if (value) return value;
  }
  return '';
}

export function agentEnvDirectory(options = {}) {
  return path.join(homeDirectory(options), '.agentsam', 'env.d');
}

export function agentEnvLoaderPath(options = {}) {
  return path.join(homeDirectory(options), '.agentsam', 'load-agent-env.sh');
}

export function ensureAgentEnvLoader(options = {}) {
  const filename = agentEnvLoaderPath(options);
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const source = `# AgentSam provider environment loader. Source this file; do not execute it.
_agentsam_profile=\"\${1:-}\"
case \"\$_agentsam_profile\" in
  openai|anthropic|gemini|grok|cloudflare) ;;
  *) echo \"usage: source ~/.agentsam/load-agent-env.sh <openai|anthropic|gemini|grok|cloudflare>\" >&2; return 2 2>/dev/null || exit 2 ;;
esac
_agentsam_file=\"\${HOME}/.agentsam/env.d/\${_agentsam_profile}.env\"
if [ ! -f \"\$_agentsam_file\" ]; then
  echo \"AgentSam provider profile not found: \$_agentsam_file\" >&2
  return 1 2>/dev/null || exit 1
fi
set -a
. \"\$_agentsam_file\"
set +a
if [ \"\$_agentsam_profile\" = cloudflare ]; then
  if [ -z \"\${ACCOUNT_ID:-}\" ] && [ -n \"\${CLOUDFLARE_ACCOUNT_ID:-}\" ]; then export ACCOUNT_ID=\"\$CLOUDFLARE_ACCOUNT_ID\"; fi
  if [ -z \"\${CLOUDFLARE_ACCOUNT_ID:-}\" ] && [ -n \"\${ACCOUNT_ID:-}\" ]; then export CLOUDFLARE_ACCOUNT_ID=\"\$ACCOUNT_ID\"; fi
fi
unset _agentsam_file _agentsam_profile
`;
  fs.writeFileSync(filename, source, { mode: 0o700 });
  if (process.platform !== 'win32') fs.chmodSync(filename, 0o700);
  return filename;
}

function profileTemplate(provider, options = {}) {
  if (provider === 'cloudflare') {
    const accountId = normalizeCloudflareAccountId(options.accountId);
    return `# AgentSam Cloudflare profile\n# ACCOUNT_ID is your Cloudflare account identifier; it is not a secret.\nexport ACCOUNT_ID=\"${accountId}\"\nexport CLOUDFLARE_API_TOKEN=\"\"\n`;
  }
  const spec = PROVIDER_CREDENTIALS[provider];
  if (!spec) throw new Error(`unsupported_provider:${provider}`);
  return `# AgentSam ${provider} provider profile\nexport ${spec.env}=\"\"\n`;
}

export function ensureProviderEnvProfile(provider, options = {}) {
  const spec = providerCredentialSpec(provider);
  if (!spec) throw new Error(`unsupported_provider:${clean(provider).toLowerCase()}`);
  const dir = agentEnvDirectory(options);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') fs.chmodSync(dir, 0o700);
  const filename = path.join(dir, spec.files[0]);
  let created = false;
  if (!fs.existsSync(filename)) {
    fs.writeFileSync(filename, profileTemplate(spec.provider, options), { mode: 0o600 });
    created = true;
  } else if (spec.provider === 'cloudflare' && clean(options.accountId)) {
    const source = fs.readFileSync(filename, 'utf8');
    const current = firstEnvValue(source, spec.accountEnv || []);
    if (!current) {
      const accountId = normalizeCloudflareAccountId(options.accountId);
      const line = `export ACCOUNT_ID=\"${accountId}\"`;
      const next = /^(?:export\s+)?ACCOUNT_ID=.*$/m.test(source)
        ? source.replace(/^(?:export\s+)?ACCOUNT_ID=.*$/m, line)
        : `${line}\n${source}`;
      fs.writeFileSync(filename, next, { mode: 0o600 });
    }
  }
  if (process.platform !== 'win32') fs.chmodSync(filename, 0o600);
  const loader = ensureAgentEnvLoader(options);
  return Object.freeze({ provider: spec.provider, file: filename, loader, created, source_command: `source ~/.agentsam/load-agent-env.sh ${spec.provider}` });
}

export function providerCredentialSpec(provider) {
  const id = clean(provider).toLowerCase();
  const spec = PROVIDER_CREDENTIALS[id];
  return spec ? Object.freeze({ provider: id, ...spec }) : null;
}

export function resolveProviderCredential(provider, options = {}) {
  const spec = providerCredentialSpec(provider);
  if (!spec) return Object.freeze({ provider: clean(provider).toLowerCase(), configured: false, source: null, error: 'unsupported_provider', value: '' });
  const env = options.env || process.env;
  const accountIdFromEnv = firstRuntimeValue(env, spec.accountEnv || []);
  const fromEnv = clean(env?.[spec.env]);
  if (fromEnv) return Object.freeze({ provider: spec.provider, configured: true, source: 'environment', env: spec.env, file: null, error: null, value: fromEnv, account_id: accountIdFromEnv || null });

  const dir = agentEnvDirectory({ ...options, env });
  for (const basename of spec.files) {
    const filename = path.join(dir, basename);
    if (!fs.existsSync(filename)) continue;
    try {
      const safety = secureFile(filename);
      if (!safety.ok) return Object.freeze({ provider: spec.provider, configured: false, source: 'agentsam_env_file', env: spec.env, file: filename, error: safety.error, value: '' });
      const source = fs.readFileSync(filename, 'utf8');
      const value = clean(parseEnvValue(source, spec.env));
      const accountId = accountIdFromEnv || firstEnvValue(source, spec.accountEnv || []);
      if (value) return Object.freeze({ provider: spec.provider, configured: true, source: 'agentsam_env_file', env: spec.env, file: filename, error: null, value, account_id: accountId || null });
      return Object.freeze({ provider: spec.provider, configured: false, source: 'agentsam_env_file', env: spec.env, file: filename, error: 'credential_variable_missing', value: '' });
    } catch (error) {
      return Object.freeze({ provider: spec.provider, configured: false, source: 'agentsam_env_file', env: spec.env, file: filename, error: error?.message || String(error), value: '' });
    }
  }
  return Object.freeze({ provider: spec.provider, configured: false, source: null, env: spec.env, file: null, error: null, value: '' });
}

export function describeProviderCredential(provider, options = {}) {
  const resolved = resolveProviderCredential(provider, options);
  return Object.freeze({
    provider: resolved.provider,
    configured: resolved.configured,
    source: resolved.source,
    env: resolved.env || null,
    file: resolved.file || null,
    error: resolved.error || null,
    account_id: resolved.account_id || null,
  });
}

export function listProviderCredentialStatus(options = {}) {
  return Object.freeze(Object.keys(PROVIDER_CREDENTIALS).map((provider) => describeProviderCredential(provider, options)));
}
