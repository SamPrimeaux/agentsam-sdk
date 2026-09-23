import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getSecureProviderKey,
  setSecureProviderKey,
  deleteSecureProviderKey,
  hydrateSecureCredentials,
} from '../security/local-vault.js';

export { hydrateSecureCredentials };

export const PROVIDER_CREDENTIALS = Object.freeze({
  openai: Object.freeze({ label: 'OpenAI', env: 'OPENAI_API_KEY', files: ['openai.env'], modelProvider: 'openai' }),
  anthropic: Object.freeze({ label: 'Anthropic', env: 'ANTHROPIC_API_KEY', files: ['anthropic.env'], modelProvider: 'anthropic' }),
  gemini: Object.freeze({ label: 'Gemini', env: 'GEMINI_API_KEY', files: ['gemini.env'], modelProvider: 'gemini' }),
  cursor: Object.freeze({ label: 'Cursor', env: 'CURSOR_API_KEY', files: ['cursor.env'], modelProvider: 'cursor' }),
  xai: Object.freeze({ label: 'xAI', env: 'XAI_API_KEY', files: ['xai.env', 'grok.env'], modelProvider: 'xai' }),
  cloudflare: Object.freeze({
    label: 'Cloudflare',
    env: 'CLOUDFLARE_API_TOKEN',
    files: ['cloudflare.env'],
    modelProvider: 'cloudflare',
    accountEnv: ['CLOUDFLARE_ACCOUNT_ID'],
  }),
  inneranimalmedia: Object.freeze({
    label: 'InnerAnimalMedia',
    env: 'AGENTSAM_API_KEY',
    files: ['inneranimalmedia.env'],
    tokenPrefix: 'aak_',
    platformCredential: true,
  }),
});

const PROVIDER_ALIASES = Object.freeze({
  grok: 'xai',
  iam: 'inneranimalmedia',
  inneranimal: 'inneranimalmedia',
});

function clean(value) { return value == null ? '' : String(value).trim(); }

export function normalizeProviderId(provider) {
  const id = clean(provider).toLowerCase();
  return PROVIDER_ALIASES[id] || id;
}

function normalizeCloudflareAccountId(value) {
  const id = clean(value);
  if (!id) return '';
  if (!/^[a-f0-9]{32}$/i.test(id)) throw new Error('invalid_cloudflare_account_id');
  return id;
}

function validateCredentialValue(spec, value) {
  const secret = clean(value);
  if (!secret) throw new Error('credential_required');
  if (/[\r\n\0]/.test(secret)) throw new Error('credential_must_be_single_line');
  if (spec.tokenPrefix && !secret.startsWith(spec.tokenPrefix)) {
    throw new Error(`credential_prefix_required:${spec.tokenPrefix}`);
  }
  return secret;
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

function atomicWrite(filename, source, mode = 0o600) {
  const dir = path.dirname(filename);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') fs.chmodSync(dir, 0o700);
  const temp = `${filename}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, source, { mode });
  if (process.platform !== 'win32') fs.chmodSync(temp, mode);
  fs.renameSync(temp, filename);
  if (process.platform !== 'win32') fs.chmodSync(filename, mode);
}

function envLiteral(value) {
  const text = String(value ?? '');
  if (/['"\r\n\0]/.test(text)) throw new Error('credential_contains_unsupported_profile_character');
  return `"${text}"`;
}

export function agentEnvDirectory(options = {}) {
  return path.join(homeDirectory(options), '.agentsam', 'env.d');
}

export function agentEnvLoaderPath(options = {}) {
  return path.join(homeDirectory(options), '.agentsam', 'load-agent-env.sh');
}

export function ensureAgentEnvLoader(options = {}) {
  const filename = agentEnvLoaderPath(options);
  const supported = Object.keys(PROVIDER_CREDENTIALS).join('|');
  const source = `# AgentSam provider environment loader. Source this file; do not execute it.
if [ "$#" -eq 0 ]; then
  echo "usage: source ~/.agentsam/load-agent-env.sh <profile> [profile ...]" >&2
  return 2 2>/dev/null || exit 2
fi
for _agentsam_profile in "$@"; do
  case "$_agentsam_profile" in
    grok) _agentsam_profile="xai" ;;
    ${supported}) ;;
    *) echo "unknown AgentSam provider profile: $_agentsam_profile" >&2; return 2 2>/dev/null || exit 2 ;;
  esac
  _agentsam_file="\${HOME}/.agentsam/env.d/\${_agentsam_profile}.env"
  if [ ! -f "$_agentsam_file" ]; then
    echo "AgentSam provider profile not found: $_agentsam_file" >&2
    return 1 2>/dev/null || exit 1
  fi
  set -a
  . "$_agentsam_file"
  set +a
done
unset _agentsam_file _agentsam_profile
`;
  atomicWrite(filename, source, 0o700);
  return filename;
}

function profileSource(provider, credential = '', options = {}) {
  const spec = providerCredentialSpec(provider);
  if (!spec) throw new Error(`unsupported_provider:${normalizeProviderId(provider)}`);
  const lines = [`# AgentSam ${spec.label} provider profile`];
  if (spec.provider === 'cloudflare') {
    lines.push('# CLOUDFLARE_ACCOUNT_ID is your Cloudflare account identifier; it is not a secret.');
    lines.push(`export CLOUDFLARE_ACCOUNT_ID=${envLiteral(normalizeCloudflareAccountId(options.accountId))}`);
  }
  lines.push(`export ${spec.env}=${envLiteral(credential)}`);
  return `${lines.join('\n')}\n`;
}

export function providerCredentialSpec(provider) {
  const id = normalizeProviderId(provider);
  const spec = PROVIDER_CREDENTIALS[id];
  return spec ? Object.freeze({ provider: id, ...spec }) : null;
}

export function ensureProviderEnvProfile(provider, options = {}) {
  const spec = providerCredentialSpec(provider);
  if (!spec) throw new Error(`unsupported_provider:${normalizeProviderId(provider)}`);
  const dir = agentEnvDirectory(options);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') fs.chmodSync(dir, 0o700);
  const filename = path.join(dir, spec.files[0]);
  let created = false;
  if (!fs.existsSync(filename)) {
    atomicWrite(filename, profileSource(spec.provider, '', options), 0o600);
    created = true;
  } else {
    const safety = secureFile(filename);
    if (!safety.ok) throw new Error(safety.error);
    if (process.platform !== 'win32') fs.chmodSync(filename, 0o600);
    if (spec.provider === 'cloudflare' && clean(options.accountId)) {
      const source = fs.readFileSync(filename, 'utf8');
      const current = firstEnvValue(source, spec.accountEnv || []);
      if (!current) {
        const accountId = normalizeCloudflareAccountId(options.accountId);
        const line = `export CLOUDFLARE_ACCOUNT_ID=${envLiteral(accountId)}`;
        const next = /^(?:export\s+)?CLOUDFLARE_ACCOUNT_ID=.*$/m.test(source)
          ? source.replace(/^(?:export\s+)?CLOUDFLARE_ACCOUNT_ID=.*$/m, line)
          : `${line}\n${source}`;
        atomicWrite(filename, next, 0o600);
      }
    }
  }
  const loader = ensureAgentEnvLoader(options);
  return Object.freeze({
    provider: spec.provider,
    file: filename,
    loader,
    created,
    source_command: `source ~/.agentsam/load-agent-env.sh ${spec.provider}`,
  });
}

export function setProviderCredential(provider, credential, options = {}) {
  const spec = providerCredentialSpec(provider);
  if (!spec) throw new Error(`unsupported_provider:${normalizeProviderId(provider)}`);
  const value = validateCredentialValue(spec, credential);
  setSecureProviderKey(spec.provider, { value, accountId: options.accountId }, options);
  if (typeof process !== 'undefined' && process.env) {
    process.env[spec.env] = value;
    if (spec.provider === 'cloudflare' && options.accountId) {
      process.env.CLOUDFLARE_ACCOUNT_ID = options.accountId;
    }
  }
  let file = null;
  let loader = null;
  let sourceCommand = null;
  if (options.exportProfile === true || options.writeEnvProfile === true) {
    const filename = path.join(agentEnvDirectory(options), spec.files[0]);
    atomicWrite(filename, profileSource(spec.provider, value, options), 0o600);
    loader = ensureAgentEnvLoader(options);
    file = filename;
    sourceCommand = `source ~/.agentsam/load-agent-env.sh ${spec.provider}`;
  }
  return Object.freeze({
    provider: spec.provider,
    file,
    loader,
    source_command: sourceCommand,
  });
}

/**
 * Exports a configured provider credential from the secure vault to a plaintext .env file.
 * This is an explicit opt-in action for operators who need to source credentials into external shells.
 * The standard AgentSam setup flows (interactive picker, models --setup, providers add)
 * intentionally do NOT invoke this, keeping the credential strictly inside the encrypted vault.
 */
export function exportProviderEnvProfile(provider, options = {}) {
  const spec = providerCredentialSpec(provider);
  if (!spec) throw new Error(`unsupported_provider:${normalizeProviderId(provider)}`);
  const resolved = resolveProviderCredential(spec.provider, options);
  if (!resolved.configured || !resolved.value) {
    throw new Error(`provider_not_configured:${spec.provider}`);
  }
  const filename = path.join(agentEnvDirectory(options), spec.files[0]);
  atomicWrite(filename, profileSource(spec.provider, resolved.value, { ...options, accountId: resolved.account_id }), 0o600);
  const loader = ensureAgentEnvLoader(options);
  return Object.freeze({
    provider: spec.provider,
    file: filename,
    loader,
    source_command: `source ~/.agentsam/load-agent-env.sh ${spec.provider}`,
  });
}

export function removeProviderCredential(provider, options = {}) {
  const spec = providerCredentialSpec(provider);
  if (!spec) throw new Error(`unsupported_provider:${normalizeProviderId(provider)}`);
  deleteSecureProviderKey(spec.provider, options);
  const dir = agentEnvDirectory(options);
  let removed = false;
  for (const basename of spec.files) {
    const filename = path.join(dir, basename);
    if (!fs.existsSync(filename)) continue;
    const safety = secureFile(filename);
    if (!safety.ok) throw new Error(safety.error);
    fs.rmSync(filename, { force: true });
    removed = true;
  }
  if (typeof process !== 'undefined' && process.env) {
    delete process.env[spec.env];
  }
  return Object.freeze({ provider: spec.provider, removed });
}

export function resolveProviderCredential(provider, options = {}) {
  const spec = providerCredentialSpec(provider);
  if (!spec) return Object.freeze({ provider: normalizeProviderId(provider), configured: false, source: null, error: 'unsupported_provider', value: '' });
  const env = options.env || process.env;
  const accountIdFromEnv = firstRuntimeValue(env, spec.accountEnv || []);
  const fromEnv = clean(env?.[spec.env]);
  if (fromEnv) {
    const prefixError = spec.tokenPrefix && !fromEnv.startsWith(spec.tokenPrefix) ? `credential_prefix_required:${spec.tokenPrefix}` : null;
    return Object.freeze({
      provider: spec.provider,
      configured: !prefixError,
      source: 'environment',
      env: spec.env,
      file: null,
      error: prefixError,
      value: prefixError ? '' : fromEnv,
      account_id: accountIdFromEnv || null,
    });
  }

  const secure = getSecureProviderKey(spec.provider, options);
  if (secure && clean(secure.value)) {
    const val = clean(secure.value);
    const prefixError = spec.tokenPrefix && !val.startsWith(spec.tokenPrefix) ? `credential_prefix_required:${spec.tokenPrefix}` : null;
    return Object.freeze({
      provider: spec.provider,
      configured: !prefixError,
      source: secure.source || 'local_vault',
      env: spec.env,
      file: null,
      error: prefixError,
      value: prefixError ? '' : val,
      account_id: accountIdFromEnv || secure.accountId || null,
    });
  }

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
      const prefixError = spec.tokenPrefix && value && !value.startsWith(spec.tokenPrefix) ? `credential_prefix_required:${spec.tokenPrefix}` : null;
      if (value && !prefixError) return Object.freeze({ provider: spec.provider, configured: true, source: 'agentsam_env_file', env: spec.env, file: filename, error: null, value, account_id: accountId || null });
      return Object.freeze({ provider: spec.provider, configured: false, source: 'agentsam_env_file', env: spec.env, file: filename, error: prefixError || 'credential_variable_missing', value: '' });
    } catch (error) {
      return Object.freeze({ provider: spec.provider, configured: false, source: 'agentsam_env_file', env: spec.env, file: filename, error: error?.message || String(error), value: '' });
    }
  }
  return Object.freeze({ provider: spec.provider, configured: false, source: null, env: spec.env, file: null, error: null, value: '', account_id: accountIdFromEnv || null });
}

export function describeProviderCredential(provider, options = {}) {
  const resolved = resolveProviderCredential(provider, options);
  const spec = providerCredentialSpec(provider);
  return Object.freeze({
    provider: resolved.provider,
    label: spec?.label || resolved.provider,
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
