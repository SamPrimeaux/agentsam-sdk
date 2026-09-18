import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isApiKey, resolveApiKey } from '../../packages/identity/src/contracts/auth-config.js';

export const ACCOUNT_SESSION_SCHEMA = 'agentsam-account-session-v2';

function clean(value) { return value == null ? '' : String(value).trim(); }
function homeDirectory(options = {}) {
  return path.resolve(clean(options.home) || clean(options.env?.HOME) || clean(options.env?.USERPROFILE) || os.homedir());
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
    if (parsed?.schema_version !== ACCOUNT_SESSION_SCHEMA) return null;
    const token = clean(parsed.access_token);
    if (!token || isApiKey(token)) return null;
    return {
      schema_version: ACCOUNT_SESSION_SCHEMA,
      access_token: token,
      user_id: clean(parsed.user_id) || null,
      account_id: clean(parsed.account_id) || null,
      email: clean(parsed.email) || null,
      created_at: clean(parsed.created_at) || null,
      updated_at: clean(parsed.updated_at) || null,
    };
  } catch {
    return null;
  }
}

export function saveAccountSession(session = {}, options = {}) {
  const token = clean(session.access_token);
  if (!token || isApiKey(token)) throw new Error('account_browser_session_required');
  const filename = accountSessionPath(options);
  const dir = path.dirname(filename);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    try { fs.chmodSync(dir, 0o700); } catch { /* best effort */ }
  }
  const previous = readAccountSession(options);
  const now = new Date().toISOString();
  const value = {
    schema_version: ACCOUNT_SESSION_SCHEMA,
    access_token: token,
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

export function resolveAccountApiKey(options = {}) {
  const env = options.env || process.env;
  const explicit = clean(options.explicit);
  const value = resolveApiKey(env, explicit);
  if (!value) return { value: '', source: null };
  if (!isApiKey(value)) return { value: '', source: null, error: 'invalid_api_key_prefix' };
  return { value, source: explicit ? 'explicit' : 'environment', kind: 'api_key' };
}

export function resolveBrowserSessionCredential(options = {}) {
  const session = readAccountSession(options);
  return session?.access_token
    ? { value: session.access_token, source: 'agentsam_browser_session', kind: 'browser_session', session }
    : { value: '', source: null, kind: null, session: null };
}

/** Platform auth resolution: explicit/API-key env first, interactive browser session second. */
export function resolveAccountAuth(options = {}) {
  const apiKey = resolveAccountApiKey(options);
  if (apiKey.value || apiKey.error) return apiKey;
  return resolveBrowserSessionCredential(options);
}

export function describeAccountSession(options = {}) {
  const session = readAccountSession(options);
  return {
    configured: Boolean(session?.access_token),
    source: session?.access_token ? 'agentsam_browser_session' : null,
    user_id: session?.user_id || null,
    account_id: session?.account_id || null,
    email: session?.email || null,
  };
}
