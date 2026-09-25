/**
 * Cookie name + session policy re-exports.
 * Route vocabulary → contracts/routes.js (identity endpoints only).
 * Product homes / mounts → each app's agentsam.app.json (not this package).
 */

import { SESSION_POLICY } from './session-policy.js';

export { SESSION_POLICY, clampAgentSessionTtl } from './session-policy.js';

export const AUTH_COOKIE_NAME = 'session';

/** @deprecated Prefer SESSION_POLICY.browser.ttlSeconds */
export const AUTH_SESSION_TTL_SECONDS = SESSION_POLICY.browser.ttlSeconds;
