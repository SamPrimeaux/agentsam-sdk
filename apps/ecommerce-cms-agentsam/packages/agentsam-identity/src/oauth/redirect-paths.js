/**
 * Post-OAuth redirect helpers — portable path policy with host injectables.
 * Hosts MUST pass loginPath from their route projection (never hardcode).
 */

import { sanitizeBrowserNextPath } from '../core/browser-paths.js';
import { IdentityRoutingError } from '../contracts/identity-store.js';

/**
 * @typedef {object} OAuthRedirectPathOptions
 * @property {string} [authCookieName]
 * @property {string} loginPath concrete projection of identity.login
 * @property {string} [fallback] only used when isAllowedLoginResumePath rejects; prefer omit
 * @property {(path: string) => boolean} [isAllowedLoginResumePath]
 * @property {(env: unknown, rawCookie: string) => Promise<string|null>} [resolveSessionIdFromCookie]
 * @property {(env: unknown, sessionId: string, reason: string, userId: string|null) => Promise<void>} [revokeAuthSession]
 */

export function createOAuthRedirectHelpers(options = {}) {
  const authCookieName = options.authCookieName ?? 'iam_session';
  const loginPath = options.loginPath;
  if (!loginPath || !String(loginPath).startsWith('/')) {
    throw new IdentityRoutingError(
      'AUTH_ROUTE_MISSING',
      'createOAuthRedirectHelpers requires loginPath from route projection',
    );
  }
  const isAllowedLoginResumePath = options.isAllowedLoginResumePath
    ?? ((path) => Boolean(sanitizeBrowserNextPath(path)));
  const resolveSessionIdFromCookie = options.resolveSessionIdFromCookie;
  const revokeAuthSession = options.revokeAuthSession;

  async function revokeIncomingCookieSession(request, env, reason = 'oauth_login_replaced') {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${authCookieName}=([^;]+)`));
    const rawCookie = match ? decodeURIComponent(String(match[1]).trim()) : null;
    if (!rawCookie || !env || typeof resolveSessionIdFromCookie !== 'function' || typeof revokeAuthSession !== 'function') {
      return;
    }
    try {
      const sessionId = await resolveSessionIdFromCookie(env, rawCookie);
      if (!sessionId) return;
      const row = env.DB?.prepare
        ? await env.DB.prepare(`SELECT user_id FROM auth_sessions WHERE id = ? LIMIT 1`)
            .bind(sessionId)
            .first()
        : null;
      await revokeAuthSession(env, sessionId, reason, row?.user_id ?? null);
    } catch {
      /* non-fatal */
    }
  }

  function safeLoginRedirectPath(_originBase, returnTo) {
    const cleaned = sanitizeBrowserNextPath(returnTo);
    if (!cleaned) {
      throw new IdentityRoutingError('AUTH_DESTINATION_UNRESOLVED', 'return_to missing/invalid');
    }
    if (!isAllowedLoginResumePath(cleaned)) {
      throw new IdentityRoutingError('AUTH_DESTINATION_UNRESOLVED', 'return_to not allowed', { returnTo: cleaned });
    }
    return cleaned;
  }

  function oauthPostLoginGlobeRedirectUrl(originBase, returnToFullUrl) {
    let path;
    try {
      const u = new URL(returnToFullUrl);
      path = u.pathname + (u.search || '');
    } catch {
      throw new IdentityRoutingError('AUTH_DESTINATION_UNRESOLVED', 'invalid returnToFullUrl');
    }
    path = safeLoginRedirectPath(originBase, path);
    return `${originBase}${loginPath}?globe_exit=1&next=${encodeURIComponent(path)}`;
  }

  return {
    revokeIncomingCookieSession,
    safeDashboardLoginRedirectPath: safeLoginRedirectPath,
    safeLoginRedirectPath,
    oauthPostLoginGlobeRedirectUrl,
  };
}
