/**
 * Post-OAuth redirect helpers — portable path policy with host injectables.
 */

const DEFAULT_DASHBOARD_FALLBACK = '/dashboard/agent';

/**
 * @typedef {object} OAuthRedirectPathOptions
 * @property {string} [authCookieName]
 * @property {string} [dashboardFallback]
 * @property {(path: string) => boolean} [isAllowedLoginResumePath]
 * @property {(env: unknown, rawCookie: string) => Promise<string|null>} [resolveSessionIdFromCookie]
 * @property {(env: unknown, sessionId: string, reason: string, userId: string|null) => Promise<void>} [revokeAuthSession]
 */

/**
 * @param {OAuthRedirectPathOptions} options
 */
export function createOAuthRedirectHelpers(options = {}) {
  const authCookieName = options.authCookieName ?? 'iam_session';
  const dashboardFallback = options.dashboardFallback ?? DEFAULT_DASHBOARD_FALLBACK;
  const isAllowedLoginResumePath = options.isAllowedLoginResumePath ?? (() => false);
  const resolveSessionIdFromCookie = options.resolveSessionIdFromCookie;
  const revokeAuthSession = options.revokeAuthSession;

  /** Revoke browser cookie session before issuing a new login session. */
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

  function safeDashboardLoginRedirectPath(originBase, returnTo) {
    if (!returnTo || typeof returnTo !== 'string') return dashboardFallback;
    const t = returnTo.trim();
    if (!t) return dashboardFallback;
    if (t.startsWith('/') && !t.startsWith('//') && !t.includes('://')) {
      if (isAllowedLoginResumePath(t)) return t;
      if (t.startsWith('/dashboard/settings/integrations')) return dashboardFallback;
      if (!t.startsWith('/dashboard')) return dashboardFallback;
      return t;
    }
    try {
      const u = new URL(t);
      const ob = new URL(originBase);
      if (u.origin !== ob.origin) return dashboardFallback;
      const p = u.pathname + (u.search || '');
      if (p.startsWith('/dashboard/settings/integrations')) return dashboardFallback;
      if (!p.startsWith('/dashboard')) return dashboardFallback;
      return p;
    } catch {
      return dashboardFallback;
    }
  }

  function oauthPostLoginGlobeRedirectUrl(originBase, returnToFullUrl) {
    let path = dashboardFallback;
    try {
      const u = new URL(returnToFullUrl);
      path = u.pathname + (u.search || '');
    } catch {
      /* keep default */
    }
    if (!path.startsWith('/') || path.startsWith('//')) path = dashboardFallback;
    if (path.startsWith('/dashboard/settings/integrations')) path = dashboardFallback;
    if (!isAllowedLoginResumePath(path) && !path.startsWith('/dashboard')) {
      path = dashboardFallback;
    }
    return `${originBase}/auth/login?globe_exit=1&next=${encodeURIComponent(path)}`;
  }

  return {
    revokeIncomingCookieSession,
    safeDashboardLoginRedirectPath,
    oauthPostLoginGlobeRedirectUrl,
  };
}
