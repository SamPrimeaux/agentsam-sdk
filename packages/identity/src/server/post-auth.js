/**
 * Fail-closed post-auth destination resolver.
 * Never redirects to "/" / marketing / invented dashboard paths.
 */

import { IDENTITY_ROUTE_IDS } from '../contracts/route-ids.js';
import { IdentityRoutingError } from '../contracts/identity-store.js';

/**
 * @typedef {{ app_id?: string|null, return_to?: string|null }} AuthTransaction
 */

/**
 * @param {{
 *   transaction?: AuthTransaction|null,
 *   app?: { id: string }|null,
 *   routeRegistry: ReturnType<import('../contracts/route-projection.js').createRouteRegistry>,
 * }} opts
 * @returns {string}
 */
export function resolvePostAuthDestination({ transaction, app, routeRegistry }) {
  if (!routeRegistry) {
    throw new IdentityRoutingError('AUTH_ROUTE_REGISTRY_REQUIRED');
  }
  if (!app?.id) {
    throw new IdentityRoutingError('AUTH_APP_UNRESOLVED');
  }

  routeRegistry.assertAuthCapable(app.id);

  const returnTo = routeRegistry.resolveReturnTo({
    appId: app.id,
    value: transaction?.return_to,
  });
  if (returnTo) return returnTo;

  const entry = routeRegistry.resolve(app.id, IDENTITY_ROUTE_IDS.APP_AUTHENTICATED)
    || routeRegistry.resolve(app.id, IDENTITY_ROUTE_IDS.APP_HOME);
  if (entry) return entry;

  const recovery = routeRegistry.resolve(app.id, IDENTITY_ROUTE_IDS.RECOVERY)
    || routeRegistry.resolve(app.id, IDENTITY_ROUTE_IDS.LOGIN);
  if (recovery) {
    return `${recovery}?error=missing_authenticated_entry`;
  }

  throw new IdentityRoutingError('AUTH_DESTINATION_UNRESOLVED', undefined, {
    appId: app.id,
    returnTo: transaction?.return_to || null,
  });
}

/**
 * Begin login redirect URL for an unauthenticated request into an app mount.
 * @param {{
 *   appId: string,
 *   returnTo: string,
 *   routeRegistry: ReturnType<import('../contracts/route-projection.js').createRouteRegistry>,
 *   origin: string,
 * }} opts
 */
export function beginLoginRedirect({ appId, returnTo, routeRegistry, origin }) {
  routeRegistry.assertAuthCapable(appId);
  const login = routeRegistry.resolve(appId, IDENTITY_ROUTE_IDS.LOGIN);
  if (!login) {
    throw new IdentityRoutingError('AUTH_ROUTE_MISSING', 'identity.login projection missing', { appId });
  }
  const safeReturn = routeRegistry.resolveReturnTo({ appId, value: returnTo }) || '';
  const url = new URL(login, origin);
  if (safeReturn) url.searchParams.set('next', safeReturn);
  return url.toString();
}

/** @deprecated Mount helpers moved with host registry — kept for host gate wiring. */
export {
  pathMatchesMount,
  resolveMountForPath,
  mountRequiresAuth,
} from './mount-policy.js';
