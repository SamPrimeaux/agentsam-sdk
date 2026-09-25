/**
 * Portable identity = semantic route IDs only.
 * Concrete paths live in host defineRouteProjection / agentsam.app.json.
 */

export { IDENTITY_ROUTE_IDS, REQUIRED_AUTH_ROUTE_IDS } from './route-ids.js';
export {
  defineRouteProjection,
  createRouteRegistry,
  projectionFromAppManifest,
} from './route-projection.js';
