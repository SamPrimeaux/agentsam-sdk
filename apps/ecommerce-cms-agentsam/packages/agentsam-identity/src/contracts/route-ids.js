/**
 * Portable identity semantics — IDs only.
 * Concrete HTTP paths are host/app projections (defineRouteProjection).
 */

export const IDENTITY_ROUTE_IDS = Object.freeze({
  LOGIN: 'identity.login',
  SIGNUP: 'identity.signup',
  RESET: 'identity.reset',
  RECOVERY: 'identity.recovery',

  AUTH_LOGIN: 'identity.api.login',
  AUTH_SIGNUP: 'identity.api.signup',
  AUTH_LOGOUT: 'identity.api.logout',
  AUTH_ME: 'identity.api.me',

  OAUTH_START: 'identity.oauth.start',
  OAUTH_CALLBACK: 'identity.oauth.callback',

  APP_AUTHENTICATED: 'app.authenticated',
  APP_HOME: 'app.home',
});

/** Required semantic routes for any auth-capable AgentSam app. */
export const REQUIRED_AUTH_ROUTE_IDS = Object.freeze([
  IDENTITY_ROUTE_IDS.LOGIN,
  IDENTITY_ROUTE_IDS.RECOVERY,
  IDENTITY_ROUTE_IDS.APP_AUTHENTICATED,
  IDENTITY_ROUTE_IDS.OAUTH_CALLBACK,
]);
