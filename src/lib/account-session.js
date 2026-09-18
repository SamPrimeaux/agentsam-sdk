import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isApiKey, resolveApiKey } from '../../packages/identity/src/contracts/auth-config.js';

export const ACCOUNT_SESSION_SCHEMA = 'agentsam-account-session-v3';
const LEGACY_ACCOUNT_SESSION_SCHEMA = 'agentsam-account-session-v2';

function clean(value) { return value == null ? '' : String(value).trim(); }
function homeDirectory(options = {}) {
  return path.resolve(clean(options.home) || clean(options.env?.HOME) || clean(options.env?.USERPROFILE) || os.homedir());
}
function isoOrNull(value) {
  const raw = clean(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
function expiresAtFrom(session = {}, nowMs = Date.now()) {
  const explicit = isoOrNull(session.expires_at);
  if (explicit) return explicit;
  const expiresIn = Number(session.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  return new Date(nowMs + (expiresIn * 1000)).toISOString();
}

export function accountSessionPath(options = {}) {
  return path.join(homeDirectory(options), '.agentsam', 'auth', 'session.json');
}

export function readAccountSession(options = {}) {
  const filename = accountSessionPath(options);
  if (!fs.existsSync(filename)) return null;
  try {
    const stat = fs.statSync(filename);
    if (!stat.isFile()) return null;
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) return null;
    const parsed = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (![ACCOUNT_SESSION_SCHEMA, LEGACY_ACCOUNT_SESSION_SCHEMA].includes(parsed?.schema_version)) return null;
    const accessToken = clean(parsed.access_token);
    const refreshToken = clean(parsed.refresh_token);
    if (!accessToken || isApiKey(accessToken) || (refreshToken && isApiKey(refreshToken))) return null;
    return {
      schema_version: ACCOUNT_SESSION_SCHEMA,
      access_token: accessToken,
      refresh_token: refreshToken || null,
      token_type: clean(parsed.token_type) || 'Bearer',
      scope: clean(parsed.scope) || null,
      expires_at: isoOrNull(parsed.expires_at),
      client_id: clean(parsed.client_id) || null,
      user_id: clean(parsed.user_id) || null,
      account_id: clean(parsed.account_id) || null,
      email: clean(parsed.email) || null,
      created_at: isoOrNull(parsed.created_at),
      updated_at: isoOrNull(parsed.updated_at),
      migrated_from: parsed.schema_version === LEGACY_ACCOUNT_SESSION_SCHEMA ? LEGACY_ACCOUNT_SESSION_SCHEMA : null,
    };
  } catch {
    return null;
  }
}

export function saveAccountSession(session = {}, options = {}) {
  const accessToken = clean(session.access_token);
  const suppliedRefresh = clean(session.refresh_token);
  if (!accessToken || isApiKey(accessToken) || (suppliedRefresh && isApiKey(suppliedRefresh))) {
    throw new Error('account_browser_oauth_session_required');
  }

  const filename = accountSessionPath(options);
  const dir = path.dirname(filename);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    try { fs.chmodSync(dir, 0o700); } catch { /* best effort */ }
  }

  const previous = readAccountSession(options);
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const now = new Date(nowMs).toISOString();
  const preserveRefreshToken = options.preserveRefreshToken !== false;
  const value = {
    schema_version: ACCOUNT_SESSION_SCHEMA,
    access_token: accessToken,
    refresh_token: suppliedRefresh || (preserveRefreshToken ? previous?.refresh_token : null) || null,
    token_type: clean(session.token_type) || previous?.token_type || 'Bearer',
    scope: clean(session.scope) || previous?.scope || null,
    expires_at: expiresAtFrom(session, nowMs),
    client_id: clean(session.client_id) || previous?.client_id || null,
    user_id: clean(session.user_id) || previous?.user_id || null,
    account_id: clean(session.account_id) || previous?.account_id || null,
    email: clean(session.email) || previous?.email || null,
    created_at: previous?.created_at || now,
    updated_at: now,
  };

  const temp = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== 'win32') {
    try { fs.chmodSync(temp, 0o600); } catch { /* best effort */ }
  }
  fs.renameSync(temp, filename);
  return { ...value };
}

export function clearAccountSession(options = {}) {
  const filename = accountSessionPath(options);
  if (!fs.existsSync(filename)) return false;
  fs.rmSync(filename, { force: true });
  return true;
}

export function isBrowserSessionExpired(session, options = {}) {
  const expiresAt = Date.parse(clean(session?.expires_at));
  if (!Number.isFinite(expiresAt)) return false;
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const skewMs = Number.isFinite(Number(options.skewMs)) ? Number(options.skewMs) : 60_000;
  return expiresAt <= (nowMs + Math.max(0, skewMs));
}

export function resolveAccountApiKey(options = {}) {
  const env = options.env || process.env;
  const explicit = clean(options.explicit);
  const value = resolveApiKey(env, explicit);
  if (!value) return { value: '', source: null, kind: null };
  if (!isApiKey(value)) return { value: '', source: explicit ? 'explicit' : 'environment', kind: 'api_key', error: 'invalid_api_key_prefix' };
  return { value, source: explicit ? 'explicit' : 'environment', kind: 'api_key' };
}

export function resolveBrowserSessionCredential(options = {}) {
  const session = readAccountSession(options);
  if (!session?.access_token) return { value: '', source: null, kind: null, session: null, expired: false };
  const expired = isBrowserSessionExpired(session, options);
  return {
    value: expired ? '' : session.access_token,
    source: 'agentsam_browser_oauth',
    kind: 'browser_oauth',
    session,
    expired,
    error: expired ? 'browser_oauth_session_expired' : null,
  };
}

/**
 * Synchronous authority snapshot kept for low-level compatibility.
 * Runtime SDK calls should use resolveAccountAuthority() from auth.js so expired
 * OAuth sessions can refresh before a request is sent.
 */
export function resolveAccountAuth(options = {}) {
  const apiKey = resolveAccountApiKey(options);
  if (apiKey.value || apiKey.error) return apiKey;
  return resolveBrowserSessionCredential(options);
}

export function describeAccountSession(options = {}) {
  const session = readAccountSession(options);
  return {
    configured: Boolean(session?.access_token),
    source: session?.access_token ? 'agentsam_browser_oauth' : null,
    kind: session?.access_token ? 'browser_oauth' : null,
    refreshable: Boolean(session?.refresh_token),
    expires_at: session?.expires_at || null,
    expired: session ? isBrowserSessionExpired(session, options) : false,
    user_id: session?.user_id || null,
    account_id: session?.account_id || null,
    email: session?.email || null,
  };
}
