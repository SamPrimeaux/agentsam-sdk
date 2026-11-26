/**
 * Host/app HTTP projection of semantic identity route IDs.
 * Identity core never hardcodes /auth/login, /agentsam, etc.
 */

import { IDENTITY_ROUTE_IDS, REQUIRED_AUTH_ROUTE_IDS } from './route-ids.js';
import { IdentityRoutingError } from './identity-store.js';
import { sanitizeBrowserNextPath } from '../core/browser-paths.js';

/**
 * @typedef {{ path: string, auth?: 'required'|'optional'|'public', spa?: boolean, shell?: string, pattern?: string }} RouteProjection
 * @typedef {Record<string, string|RouteProjection>} RouteProjectionMap
 */

/**
 * @param {{ appId: string, routes: RouteProjectionMap }} input
 */
export function defineRouteProjection(input) {
  const appId = String(input?.appId || '').trim();
  if (!appId) throw new IdentityRoutingError('AUTH_APP_UNRESOLVED', 'defineRouteProjection requires appId');
  /** @type {Map<string, RouteProjection>} */
  const routes = new Map();
  for (const [routeId, value] of Object.entries(input.routes || {})) {
    const path = typeof value === 'string' ? value : value?.path;
    if (!path || !String(path).startsWith('/')) {
      throw new IdentityRoutingError('AUTH_ROUTE_PROJECTION_INVALID', `Invalid path for ${routeId}`, { appId, routeId });
    }
    routes.set(routeId, Object.freeze({
      path: String(path),
      auth: typeof value === 'object' ? value.auth : undefined,
      spa: typeof value === 'object' ? value.spa : undefined,
      shell: typeof value === 'object' ? value.shell : undefined,
      pattern: typeof value === 'object' ? value.pattern : undefined,
    }));
  }
  return Object.freeze({ appId, routes });
}

/**
 * @param {ReturnType<typeof defineRouteProjection>[]} projections
 */
export function createRouteRegistry(projections = []) {
  /** @type {Map<string, ReturnType<typeof defineRouteProjection>>} */
  const byApp = new Map();
  for (const p of projections) {
    if (!p?.appId) continue;
    byApp.set(p.appId, p);
  }

  return Object.freeze({
    get(appId) {
      return byApp.get(String(appId || '')) || null;
    },

    /**
     * @param {string} appId
     * @param {string} routeId
     * @returns {string|null}
     */
    resolve(appId, routeId) {
      const proj = byApp.get(String(appId || ''));
      if (!proj) return null;
      const entry = proj.routes.get(routeId);
      return entry?.path || null;
    },

    /**
     * Expand parameterized patterns, e.g. /api/oauth/:provider/callback
     * @param {string} appId
     * @param {string} routeId
     * @param {Record<string, string>} params
     */
    resolvePath(appId, routeId, params = {}) {
      const pattern = this.resolve(appId, routeId);
      if (!pattern) return null;
      return pattern.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, key) => {
        const v = params[key];
        if (v == null || v === '') {
          throw new IdentityRoutingError('AUTH_ROUTE_PARAM_MISSING', `Missing :${key} for ${routeId}`, { appId, routeId });
        }
        return encodeURIComponent(String(v));
      });
    },

    /**
     * return_to must be same-origin relative and owned by this app's projected mounts/paths.
     * @param {{ appId: string, value?: string|null }} opts
     */
    resolveReturnTo({ appId, value }) {
      const cleaned = sanitizeBrowserNextPath(value);
      if (!cleaned) return null;
      const pathname = cleaned.split('?')[0];
      const proj = byApp.get(String(appId || ''));
      if (!proj) return null;

      const authenticated = proj.routes.get(IDENTITY_ROUTE_IDS.APP_AUTHENTICATED)?.path
        || proj.routes.get(IDENTITY_ROUTE_IDS.APP_HOME)?.path;
      if (authenticated && (pathname === authenticated || pathname.startsWith(`${authenticated}/`))) {
        return cleaned;
      }

      for (const [routeId, entry] of proj.routes) {
        if (routeId.startsWith('identity.')) continue;
        const base = entry.path.replace(/:[^/]+/g, ''); // strip params for prefix mounts
        const mount = base.replace(/\/$/, '') || entry.path;
        if (pathname === mount || pathname.startsWith(`${mount}/`)) return cleaned;
        // Explicit mount keys: app.mount./projects style — also accept path values with auth required
        if (entry.auth === 'required' && (pathname === entry.path || pathname.startsWith(`${entry.path}/`))) {
          return cleaned;
        }
      }
      return null;
    },

    /**
     * Fail closed if auth-capable app is missing required semantic projections.
     * @param {string} appId
     */
    assertAuthCapable(appId) {
      const proj = byApp.get(String(appId || ''));
      if (!proj) {
        throw new IdentityRoutingError('AUTH_APP_UNRESOLVED', `No route projection for app ${appId}`, { appId });
      }
      for (const routeId of REQUIRED_AUTH_ROUTE_IDS) {
        if (!proj.routes.has(routeId)) {
          throw new IdentityRoutingError(
            'AUTH_ROUTE_MISSING',
            `App ${appId} missing required route projection ${routeId}`,
            { appId, routeId },
          );
        }
      }
      return proj;
    },
  });
}

/**
 * Build a projection map from an agentsam.app.v1 auth+routes manifest section.
 * @param {object} manifest
 */
export function projectionFromAppManifest(manifest) {
  const appId = String(manifest?.id || '').trim();
  if (!appId) throw new IdentityRoutingError('AUTH_APP_UNRESOLVED', 'manifest.id required');

  /** @type {RouteProjectionMap} */
  const routes = {};

  const rawRoutes = manifest.routes || {};
  for (const [routeId, value] of Object.entries(rawRoutes)) {
    if (routeId === 'entry' || routeId === 'mounts' || routeId === 'paths') continue;
    routes[routeId] = value;
  }
  for (const [routeId, value] of Object.entries(rawRoutes.paths || {})) {
    routes[routeId] = value;
  }

  const auth = manifest.auth || {};
  const entry = auth.entry || {};

  function pathFor(ref, legacyPath) {
    if (legacyPath) return legacyPath;
    if (!ref) return null;
    if (typeof ref === 'string' && ref.startsWith('/')) return ref;
    if (typeof ref === 'string' && routes[ref]) {
      const v = routes[ref];
      return typeof v === 'string' ? v : v.path;
    }
    return null;
  }

  const authenticatedPath = pathFor(
    entry.authenticated || IDENTITY_ROUTE_IDS.APP_AUTHENTICATED,
    typeof rawRoutes.entry === 'string' ? rawRoutes.entry : null,
  );
  const loginPath = pathFor(entry.login || IDENTITY_ROUTE_IDS.LOGIN, null);
  const failurePath = pathFor(
    entry.failure || IDENTITY_ROUTE_IDS.RECOVERY || IDENTITY_ROUTE_IDS.LOGIN,
    loginPath,
  );

  if (authenticatedPath) {
    routes[IDENTITY_ROUTE_IDS.APP_AUTHENTICATED] = {
      path: authenticatedPath,
      auth: 'required',
      spa: true,
      shell: manifest.runtime?.shell
        ? `${manifest.runtime.assetRoot || 'dist'}/${manifest.runtime.shell}`.replace(/\/{2,}/g, '/')
        : undefined,
    };
    routes[IDENTITY_ROUTE_IDS.APP_HOME] = authenticatedPath;
  }
  if (loginPath) routes[IDENTITY_ROUTE_IDS.LOGIN] = loginPath;
  if (failurePath) routes[IDENTITY_ROUTE_IDS.RECOVERY] = failurePath;

  for (const mount of rawRoutes.mounts || []) {
    if (!mount?.path) continue;
    routes[`app.mount.${mount.path}`] = {
      path: mount.path,
      auth: mount.auth || 'required',
      spa: mount.spa,
      shell: mount.shell,
    };
  }

  if (auth.oauth?.callbackPattern) {
    routes[IDENTITY_ROUTE_IDS.OAUTH_CALLBACK] = auth.oauth.callbackPattern;
  } else if (!routes[IDENTITY_ROUTE_IDS.OAUTH_CALLBACK]) {
    routes[IDENTITY_ROUTE_IDS.OAUTH_CALLBACK] = '/api/oauth/:provider/callback';
  }
  if (auth.oauth?.startPattern) {
    routes[IDENTITY_ROUTE_IDS.OAUTH_START] = auth.oauth.startPattern;
  } else if (!routes[IDENTITY_ROUTE_IDS.OAUTH_START]) {
    routes[IDENTITY_ROUTE_IDS.OAUTH_START] = '/api/oauth/:provider/start';
  }

  return defineRouteProjection({ appId, routes });
}
