/**
 * Verify agentsam.app.v1 auth + route + shell contracts.
 * Fail package verification — never ship unresolved shells/routes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { IDENTITY_ROUTE_IDS, REQUIRED_AUTH_ROUTE_IDS } from '../contracts/route-ids.js';
import { projectionFromAppManifest, createRouteRegistry } from '../contracts/route-projection.js';
import { IdentityRoutingError } from '../contracts/identity-store.js';

/**
 * @param {object} manifest
 * @param {{ appRoot?: string, requireShellFiles?: boolean }} [opts]
 * @returns {{ ok: true, projection: object } | { ok: false, errors: string[] }}
 */
export function verifyAppAuthContract(manifest, opts = {}) {
  const errors = [];
  const appId = String(manifest?.id || '').trim();
  if (!appId) errors.push('manifest.id required');
  if (manifest?.schema !== 'agentsam.app.v1') {
    errors.push('manifest.schema must be agentsam.app.v1');
  }

  if (!manifest?.auth) {
    errors.push('auth-capable apps must declare auth { entry, oauth? }');
  } else {
    if (!manifest.auth.entry?.authenticated && !manifest.routes?.entry) {
      errors.push('auth.entry.authenticated or routes.entry required');
    }
    if (!manifest.auth.entry?.login && !manifest.routes?.paths?.[IDENTITY_ROUTE_IDS.LOGIN]
      && !manifest.routes?.[IDENTITY_ROUTE_IDS.LOGIN]) {
      errors.push('auth.entry.login (→ identity.login) required');
    }
    if (!manifest.auth.entry?.failure && !manifest.auth.entry?.login) {
      errors.push('auth.entry.failure or auth.entry.login required for recovery');
    }
  }

  let projection = null;
  try {
    projection = projectionFromAppManifest(manifest);
    const registry = createRouteRegistry([projection]);
    registry.assertAuthCapable(appId);
  } catch (err) {
    errors.push(err?.message || String(err));
  }

  if (opts.requireShellFiles !== false && opts.appRoot && projection) {
    for (const [, entry] of projection.routes) {
      if (!entry.shell) continue;
      const shellPath = path.resolve(opts.appRoot, entry.shell);
      if (!fs.existsSync(shellPath)) {
        errors.push(`declared shell missing: ${entry.shell}`);
      }
    }
    const runtimeShell = manifest.runtime?.shell;
    const assetRoot = manifest.runtime?.assetRoot || 'dist';
    if (runtimeShell) {
      const shellPath = path.resolve(opts.appRoot, assetRoot, runtimeShell);
      // Only enforce when dist exists (post-build). Pre-build: skip if assetRoot absent.
      if (fs.existsSync(path.resolve(opts.appRoot, assetRoot)) && !fs.existsSync(shellPath)) {
        errors.push(`runtime.shell missing after build: ${assetRoot}/${runtimeShell}`);
      }
    }
  }

  for (const mount of manifest.routes?.mounts || []) {
    if (!mount.path?.startsWith('/')) {
      errors.push(`invalid mount path: ${mount.path}`);
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, projection, requiredRouteIds: [...REQUIRED_AUTH_ROUTE_IDS] };
}

/**
 * @param {string} appRoot directory containing agentsam.app.json
 */
export function verifyAppPackage(appRoot, opts = {}) {
  const manifestPath = path.join(appRoot, 'agentsam.app.json');
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, errors: [`missing ${manifestPath}`] };
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    return { ok: false, errors: [`invalid JSON: ${err.message}`] };
  }
  return verifyAppAuthContract(manifest, { ...opts, appRoot });
}

export { IdentityRoutingError };
