import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROVIDER_CREDENTIALS = Object.freeze({
  openai: Object.freeze({ env: 'OPENAI_API_KEY', files: ['openai.env'] }),
  gemini: Object.freeze({ env: 'GEMINI_API_KEY', files: ['gemini.env'] }),
  anthropic: Object.freeze({ env: 'ANTHROPIC_API_KEY', files: ['anthropic.env'] }),
  grok: Object.freeze({ env: 'XAI_API_KEY', files: ['grok.env', 'xai.env'] }),
  cloudflare: Object.freeze({ env: 'CLOUDFLARE_API_TOKEN', files: ['cloudflare.env'] }),
});

function clean(value) { return value == null ? '' : String(value).trim(); }

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

export function providerCredentialSpec(provider) {
  const id = clean(provider).toLowerCase();
  const spec = PROVIDER_CREDENTIALS[id];
  return spec ? Object.freeze({ provider: id, ...spec }) : null;
}

export function resolveProviderCredential(provider, options = {}) {
  const spec = providerCredentialSpec(provider);
  if (!spec) return Object.freeze({ provider: clean(provider).toLowerCase(), configured: false, source: null, error: 'unsupported_provider', value: '' });
  const env = options.env || process.env;
  const fromEnv = clean(env?.[spec.env]);
  if (fromEnv) return Object.freeze({ provider: spec.provider, configured: true, source: 'environment', env: spec.env, file: null, error: null, value: fromEnv });

  const dir = path.join(homeDirectory({ ...options, env }), '.agentsam', 'env.d');
  for (const basename of spec.files) {
    const filename = path.join(dir, basename);
    if (!fs.existsSync(filename)) continue;
    try {
      const safety = secureFile(filename);
      if (!safety.ok) return Object.freeze({ provider: spec.provider, configured: false, source: 'agentsam_env_file', env: spec.env, file: filename, error: safety.error, value: '' });
      const value = clean(parseEnvValue(fs.readFileSync(filename, 'utf8'), spec.env));
      if (value) return Object.freeze({ provider: spec.provider, configured: true, source: 'agentsam_env_file', env: spec.env, file: filename, error: null, value });
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
  });
}

export function listProviderCredentialStatus(options = {}) {
  return Object.freeze(Object.keys(PROVIDER_CREDENTIALS).map((provider) => describeProviderCredential(provider, options)));
}
