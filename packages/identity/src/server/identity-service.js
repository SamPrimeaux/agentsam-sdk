import { AUTH_COOKIE_NAME, AUTH_SESSION_TTL_SECONDS, DASHBOARD_AFTER_LOGIN_PATH } from '../core/constants.js';
import { hashPassword, verifyPassword } from '../core/password-crypto.js';
import { jsonResponse } from '../core/http-json.js';
import { sanitizeBrowserNextPath } from '../core/browser-paths.js';
import { newAuthUserId } from '../adapters/cloudflare-d1/ids.js';

/**
 * @typedef {ReturnType<import('../adapters/cloudflare-d1/index.js').createCloudflareD1Adapter>} IdentityStorageAdapter
 */

/**
 * Server-side identity orchestration (Worker / Node). No secrets in client bundle.
 * @param {{ adapter: IdentityStorageAdapter, cookieName?: string, defaultRedirect?: string }} config
 */
export function createIdentityService(config) {
  const adapter = config.adapter;
  if (!adapter) throw new Error('identity_service_requires_adapter');
  const cookieName = config.cookieName || AUTH_COOKIE_NAME;
  const defaultRedirect = config.defaultRedirect || DASHBOARD_AFTER_LOGIN_PATH;

  function sessionCookieHeader(sessionId, requestUrl, maxAge = AUTH_SESSION_TTL_SECONDS) {
    const secure = new URL(requestUrl).protocol === 'https:';
    const parts = [
      `${cookieName}=${sessionId}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${maxAge}`,
    ];
    if (secure) parts.push('Secure');
    return parts.join('; ');
  }

  function parseSessionId(cookieHeader) {
    if (!cookieHeader) return null;
    const match = String(cookieHeader).match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  return Object.freeze({
    cookieName,
    defaultRedirect,

    async signup({ email, password, displayName }) {
      const normalized = String(email || '').trim().toLowerCase();
      if (!normalized || !password) {
        return { ok: false, error: 'email_and_password_required' };
      }
      const existing = await adapter.findUserByEmail(normalized);
      if (existing) return { ok: false, error: 'email_already_registered' };
      const { saltHex, hashHex } = await hashPassword(password);
      const user = await adapter.createUser({
        email: normalized,
        passwordHash: hashHex,
        salt: saltHex,
        displayName: displayName || normalized.split('@')[0],
      });
      const session = await adapter.createSession({
        userId: user.id,
        email: user.email,
        displayName: user.display_name,
        provider: 'email',
      });
      return { ok: true, user, session, sessionId: session.id };
    },

    async loginWithPassword({ email, password }) {
      const normalized = String(email || '').trim().toLowerCase();
      const user = await adapter.findUserByEmail(normalized);
      if (!user?.password_hash || !user?.salt) {
        return { ok: false, error: 'Invalid Identity or Access Key' };
      }
      const valid = await verifyPassword(password, user.salt, user.password_hash);
      if (!valid) return { ok: false, error: 'Invalid Identity or Access Key' };
      const session = await adapter.createSession({
        userId: user.id,
        email: user.email,
        displayName: user.display_name,
        provider: 'email',
      });
      return { ok: true, user, session, sessionId: session.id };
    },

    async sessionFromRequest(request) {
      const sessionId = parseSessionId(request.headers.get('Cookie'));
      if (!sessionId) return null;
      const session = await adapter.getSession(sessionId);
      if (!session) return null;
      const user = await adapter.findUserById(session.user_id);
      if (!user) return null;
      return { session, user, sessionId };
    },

    async logout(request) {
      const sessionId = parseSessionId(request.headers.get('Cookie'));
      if (sessionId) await adapter.revokeSession(sessionId);
      return { ok: true };
    },

    async provisionOAuthUser({ provider, providerSubject, email, displayName }) {
      let user = await adapter.findUserByProvider(provider, providerSubject);
      if (!user && email) {
        user = await adapter.findUserByEmail(email);
      }
      if (!user) {
        user = await adapter.createUser({
          email: email || `${providerSubject}@${provider}.oauth`,
          displayName: displayName || email || providerSubject,
          passwordHash: null,
          salt: null,
        });
      }
      await adapter.upsertProviderIdentity({
        accountId: user.id,
        provider,
        providerSubject,
        email: user.email,
      });
      const session = await adapter.createSession({
        userId: user.id,
        email: user.email,
        displayName: displayName || user.display_name,
        provider,
        providerSubject,
      });
      return { ok: true, authUserId: user.id, sessionId: session.id, session };
    },

    buildLoginSuccessResponse(request, sessionId, nextPath) {
      const redirect = sanitizeBrowserNextPath(nextPath) || defaultRedirect;
      return jsonResponse(
        { ok: true, redirect },
        200,
        { 'Set-Cookie': sessionCookieHeader(sessionId, request.url) },
      );
    },

    buildLogoutResponse(request) {
      const secure = new URL(request.url).protocol === 'https:';
      const clear = [
        `${cookieName}=`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=0',
      ];
      if (secure) clear.push('Secure');
      return jsonResponse({ ok: true }, 200, { 'Set-Cookie': clear.join('; ') });
    },

    parseSessionId,
    sessionCookieHeader,
  });
}

export { newAuthUserId };
