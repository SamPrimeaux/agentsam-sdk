import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { normalizeProviderId, PROVIDER_CREDENTIALS } from '../lib/provider-credentials.js';

function homeDirectory(options = {}) {
  return path.resolve(
    options.home ||
    options.env?.HOME ||
    options.env?.USERPROFILE ||
    os.homedir()
  );
}

export function localVaultDirectory(options = {}) {
  return path.join(homeDirectory(options), '.agentsam', 'vault');
}

export function localVaultPath(options = {}) {
  return path.join(localVaultDirectory(options), 'credentials.enc');
}

export function localVaultSaltPath(options = {}) {
  return path.join(localVaultDirectory(options), '.salt');
}

function ensureVaultDirectory(options = {}) {
  const dir = localVaultDirectory(options);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') {
      try { fs.chmodSync(dir, 0o700); } catch { /* ignore */ }
    }
  }
  return dir;
}

function getMachineFingerprint() {
  const parts = [
    os.hostname(),
    os.userInfo?.()?.username || process.env.USER || process.env.USERNAME || 'unknown-user',
    os.homedir(),
    process.arch,
    process.platform,
  ];
  return parts.join(':');
}

function getOrCreateSalt(options = {}) {
  ensureVaultDirectory(options);
  const saltFile = localVaultSaltPath(options);
  if (fs.existsSync(saltFile)) {
    try {
      const raw = fs.readFileSync(saltFile);
      if (raw.length === 32) return raw;
    } catch {
      // re-create if unreadable
    }
  }
  const salt = crypto.randomBytes(32);
  fs.writeFileSync(saltFile, salt, { mode: 0o600 });
  if (process.platform !== 'win32') {
    try { fs.chmodSync(saltFile, 0o600); } catch { /* ignore */ }
  }
  return salt;
}

function deriveKey(options = {}) {
  const salt = getOrCreateSalt(options);
  const fingerprint = getMachineFingerprint();
  return crypto.pbkdf2Sync(fingerprint, salt, 100_000, 32, 'sha256');
}

function encryptAes256Gcm(plaintext, aad, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  };
}

function decryptAes256Gcm(payload, aad, key) {
  if (!payload?.iv || !payload?.tag || !payload?.data) return null;
  const iv = Buffer.from(payload.iv, 'hex');
  const tag = Buffer.from(payload.tag, 'hex');
  const data = Buffer.from(payload.data, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

// --------------------------------------------------------------------------
// OS Credential Store Adapters
// --------------------------------------------------------------------------

function osStoreReadDarwin(provider) {
  try {
    const res = spawnSync('/usr/bin/security', ['find-generic-password', '-a', `agentsam:${provider}`, '-s', 'agentsam', '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (res.status === 0 && res.stdout) {
      const val = res.stdout.trim();
      if (val) return val;
    }
  } catch { /* fallback to local encrypted store */ }
  return null;
}

function osStoreWriteDarwin(provider, secret) {
  try {
    const res = spawnSync('/usr/bin/security', ['add-generic-password', '-a', `agentsam:${provider}`, '-s', 'agentsam', '-w', secret, '-U'], {
      stdio: 'ignore',
    });
    return res.status === 0;
  } catch { return false; }
}

function osStoreDeleteDarwin(provider) {
  try {
    const res = spawnSync('/usr/bin/security', ['delete-generic-password', '-a', `agentsam:${provider}`, '-s', 'agentsam'], {
      stdio: 'ignore',
    });
    return res.status === 0;
  } catch { return false; }
}

function osStoreReadWin32(provider, options = {}) {
  const file = path.join(localVaultDirectory(options), `${provider}.dpapi`);
  if (!fs.existsSync(file)) return null;
  try {
    const script = `
$bytes = [System.IO.File]::ReadAllBytes('${file.replace(/'/g, "''")}');
$dec = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);
[System.Text.Encoding]::UTF8.GetString($dec);
`;
    const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (res.status === 0 && res.stdout) {
      const val = res.stdout.trim();
      if (val) return val;
    }
  } catch { /* fallback */ }
  return null;
}

function osStoreWriteWin32(provider, secret, options = {}) {
  ensureVaultDirectory(options);
  const file = path.join(localVaultDirectory(options), `${provider}.dpapi`);
  try {
    const b64 = Buffer.from(secret, 'utf8').toString('base64');
    const script = `
$bytes = [System.Convert]::FromBase64String('${b64}');
$enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);
[System.IO.File]::WriteAllBytes('${file.replace(/'/g, "''")}', $enc);
`;
    const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      stdio: 'ignore',
    });
    return res.status === 0;
  } catch { return false; }
}

function osStoreDeleteWin32(provider, options = {}) {
  const file = path.join(localVaultDirectory(options), `${provider}.dpapi`);
  if (fs.existsSync(file)) {
    try { fs.unlinkSync(file); return true; } catch { return false; }
  }
  return false;
}

function osStoreReadLinux(provider) {
  try {
    const res = spawnSync('secret-tool', ['lookup', 'service', 'agentsam', 'provider', provider], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (res.status === 0 && res.stdout) {
      const val = res.stdout.trim();
      if (val) return val;
    }
  } catch { /* fallback */ }
  return null;
}

function osStoreWriteLinux(provider, secret) {
  try {
    const res = spawnSync('secret-tool', ['store', `--label=AgentSam ${provider}`, 'service', 'agentsam', 'provider', provider], {
      input: secret,
      encoding: 'utf8',
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    return res.status === 0;
  } catch { return false; }
}

function osStoreDeleteLinux(provider) {
  try {
    const res = spawnSync('secret-tool', ['clear', 'service', 'agentsam', 'provider', provider], {
      stdio: 'ignore',
    });
    return res.status === 0;
  } catch { return false; }
}

// --------------------------------------------------------------------------
// Encrypted Local File Store (AES-256-GCM)
// --------------------------------------------------------------------------

function readEncryptedStore(options = {}) {
  const encFile = localVaultPath(options);
  if (!fs.existsSync(encFile)) return { version: 1, secrets: {} };
  try {
    const content = fs.readFileSync(encFile, 'utf8');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && parsed.secrets) return parsed;
  } catch { /* re-initialize on corrupt file */ }
  return { version: 1, secrets: {} };
}

function writeEncryptedStore(store, options = {}) {
  ensureVaultDirectory(options);
  const encFile = localVaultPath(options);
  const tempFile = `${encFile}.${process.pid}.${Date.now()}.tmp`;
  const json = JSON.stringify({
    version: 1,
    updated_at: new Date().toISOString(),
    secrets: store.secrets || {},
  }, null, 2);

  fs.writeFileSync(tempFile, json, { mode: 0o600 });
  if (process.platform !== 'win32') {
    try { fs.chmodSync(tempFile, 0o600); } catch { /* ignore */ }
  }
  fs.renameSync(tempFile, encFile);
  if (process.platform !== 'win32') {
    try { fs.chmodSync(encFile, 0o600); } catch { /* ignore */ }
  }
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Retrieve a provider credential from OS keychain or local AES-256-GCM vault.
 * Returns { value: string, accountId?: string, source: string } or null.
 */
export function getSecureProviderKey(provider, options = {}) {
  const id = normalizeProviderId(provider);
  if (!id) return null;

  // 1. Try OS Credential Store if enabled/available
  if (options.disableOsStore !== true) {
    let osSecret = null;
    if (process.platform === 'darwin') {
      osSecret = osStoreReadDarwin(id);
    } else if (process.platform === 'win32') {
      osSecret = osStoreReadWin32(id, options);
    } else if (process.platform === 'linux') {
      osSecret = osStoreReadLinux(id);
    }
    if (osSecret) {
      try {
        const parsed = JSON.parse(osSecret);
        if (parsed && typeof parsed === 'object' && parsed.value) {
          return { value: parsed.value, accountId: parsed.accountId || null, source: 'os_keychain' };
        }
      } catch {
        return { value: osSecret, accountId: null, source: 'os_keychain' };
      }
    }
  }

  // 2. Encrypted Local Store (AES-256-GCM)
  try {
    const store = readEncryptedStore(options);
    const entry = store.secrets?.[id];
    if (!entry) return null;

    const key = deriveKey(options);
    const plaintext = decryptAes256Gcm(entry, `provider:${id}`, key);
    if (!plaintext) return null;

    try {
      const parsed = JSON.parse(plaintext);
      if (parsed && typeof parsed === 'object' && parsed.value) {
        return { value: parsed.value, accountId: parsed.accountId || null, source: 'local_vault' };
      }
    } catch {
      return { value: plaintext, accountId: null, source: 'local_vault' };
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Store a provider credential into OS keychain and local AES-256-GCM vault.
 */
export function setSecureProviderKey(provider, credential, options = {}) {
  const id = normalizeProviderId(provider);
  if (!id) throw new Error('provider_required');

  let value = '';
  let accountId = null;
  if (typeof credential === 'object' && credential !== null) {
    value = String(credential.value || credential.secret || '').trim();
    accountId = credential.accountId ? String(credential.accountId).trim() : null;
  } else {
    value = String(credential || '').trim();
    if (options.accountId) accountId = String(options.accountId).trim();
  }

  if (!value) throw new Error('credential_value_required');

  const payloadString = JSON.stringify({ value, accountId });

  // 1. Mirror into OS Credential Store (best-effort)
  let osStoreSuccess = false;
  if (options.disableOsStore !== true) {
    if (process.platform === 'darwin') {
      osStoreSuccess = osStoreWriteDarwin(id, payloadString);
    } else if (process.platform === 'win32') {
      osStoreSuccess = osStoreWriteWin32(id, payloadString, options);
    } else if (process.platform === 'linux') {
      osStoreSuccess = osStoreWriteLinux(id, payloadString);
    }
  }

  // 2. Encrypt with AES-256-GCM into local store
  const key = deriveKey(options);
  const encrypted = encryptAes256Gcm(payloadString, `provider:${id}`, key);

  const store = readEncryptedStore(options);
  store.secrets[id] = {
    ...encrypted,
    updated_at: new Date().toISOString(),
  };
  writeEncryptedStore(store, options);

  return {
    provider: id,
    stored: true,
    os_keychain: osStoreSuccess,
    local_vault: true,
  };
}

/**
 * Delete a provider credential from OS keychain and local AES-256-GCM vault.
 */
export function deleteSecureProviderKey(provider, options = {}) {
  const id = normalizeProviderId(provider);
  if (!id) return false;

  if (options.disableOsStore !== true) {
    if (process.platform === 'darwin') osStoreDeleteDarwin(id);
    else if (process.platform === 'win32') osStoreDeleteWin32(id, options);
    else if (process.platform === 'linux') osStoreDeleteLinux(id);
  }

  const store = readEncryptedStore(options);
  if (store.secrets?.[id]) {
    delete store.secrets[id];
    writeEncryptedStore(store, options);
    return true;
  }
  return false;
}

/**
 * List all providers that currently have credentials in the secure local vault.
 */
export function listSecureConfiguredProviders(options = {}) {
  const store = readEncryptedStore(options);
  return Object.keys(store.secrets || {});
}

/**
 * Hydrates environment variables from the secure vault for any unconfigured providers.
 * Loads into `env` (defaults to process.env).
 */
export function hydrateSecureCredentials(env = process.env, options = {}) {
  const hydrated = [];
  for (const [providerId, spec] of Object.entries(PROVIDER_CREDENTIALS)) {
    if (env[spec.env]) continue;
    try {
      const cred = getSecureProviderKey(providerId, options);
      if (cred?.value) {
        env[spec.env] = cred.value;
        if (providerId === 'cloudflare' && cred.accountId) {
          if (!env.ACCOUNT_ID) env.ACCOUNT_ID = cred.accountId;
          if (!env.CLOUDFLARE_ACCOUNT_ID) env.CLOUDFLARE_ACCOUNT_ID = cred.accountId;
        }
        hydrated.push(providerId);
      }
    } catch {
      // best-effort
    }
  }
  return hydrated;
}
