/**
 * APP / HOST / PLATFORM authority resolution.
 *
 * One canonical identifier per namespace — no alias env vars.
 *   APP.id     → agentsam.app.json
 *   HOST       → agentsam.app.json hosts[] (host_id + origin)
 *   PLATFORM   → IAM_OAUTH_ISSUER (account API / OAuth issuer)
 *
 * Relationships are explicit pointers, never collapsed aliases like
 * AGENTSAM_STUDIO_ORIGIN ≈ AGENTSAM_LOCAL_STUDIO_ORIGIN ≈ IAM_OAUTH_ISSUER.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLATFORM_ACCOUNT_ISSUER,
  resolveIamIssuer,
} from '../../packages/identity/src/contracts/auth-config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

/** PLATFORM account-authority issuer — re-export from identity contract. */
export { PLATFORM_ACCOUNT_ISSUER };

/** APP.id for the Local Studio host product. */
export const LOCAL_STUDIO_APP_ID = 'local-studio';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeOrigin(value) {
  return clean(value).replace(/\/+$/, '');
}

function readAppManifest(appId, root = REPO_ROOT) {
  const id = clean(appId);
  if (!id) return null;
  for (const parent of ['apps', 'packages']) {
    const manifestPath = path.join(root, parent, id, 'agentsam.app.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * HOST namespace entries declared on an APP manifest.
 * @returns {Array<{ host_id: string, origin: string, role?: string }>}
 */
export function listAppHosts(appId, options = {}) {
  const manifest = readAppManifest(appId, options.root || REPO_ROOT);
  const hosts = manifest?.hosts;
  if (!Array.isArray(hosts)) return [];
  return hosts
    .map((row) => ({
      host_id: clean(row?.host_id || row?.id),
      origin: normalizeOrigin(row?.origin),
      role: clean(row?.role) || null,
    }))
    .filter((row) => row.host_id && row.origin);
}

/**
 * Resolve one HOST origin for an APP.
 * Prefers role=production, then first declared host.
 */
export function resolveAppHostOrigin(appId, options = {}) {
  const hosts = listAppHosts(appId, options);
  if (!hosts.length) return '';
  if (options.hostId) {
    const hit = hosts.find((h) => h.host_id === options.hostId);
    return hit?.origin || '';
  }
  const role = clean(options.role) || 'production';
  const byRole = hosts.find((h) => h.role === role);
  return (byRole || hosts[0]).origin;
}

/**
 * PLATFORM issuer for account API / whoami / aak_* calls.
 * Delegates to identity resolveIamIssuer (never APP host).
 */
export function resolvePlatformAccountIssuer(env = process.env, explicit = '') {
  return resolveIamIssuer(env, explicit);
}

/**
 * Origin for Google / Cloudflare identity + CF connection OAuth owned by local-studio.
 * HOST namespace from APP.hosts — never aliased to IAM_OAUTH_ISSUER.
 */
export function resolveLocalStudioHostOrigin(options = {}) {
  const fromManifest = resolveAppHostOrigin(LOCAL_STUDIO_APP_ID, {
    root: options.root,
    role: options.role || 'production',
    hostId: options.hostId,
  });
  if (fromManifest) return fromManifest;
  return 'https://agentsam.inneranimalmedia.com';
}
