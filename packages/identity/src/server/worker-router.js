import { createCloudflareD1Adapter } from '../adapters/cloudflare-d1/index.js';
import { createIdentityService } from './identity-service.js';
import { jsonResponse } from '../core/http-json.js';
import { hashPassword } from '../core/password-crypto.js';
import { createPasswordResetService } from '../recovery/password-reset.js';
import { getGoogleAuthUrl, exchangeGoogleCode } from '../providers/google/oauth.js';
import { fetchGoogleProfile } from '../providers/google/profile.js';
import { getGithubAuthUrl, exchangeGithubCode } from '../providers/github/oauth.js';
import { fetchGithubProfile } from '../providers/github/profile.js';
import { getCloudflareAuthUrl, exchangeCloudflareCode } from '../providers/cloudflare/oauth.js';
import { fetchCloudflareProfile } from '../providers/cloudflare/profile.js';
import { IDENTITY_ROUTE_IDS } from '../contracts/route-ids.js';
import { IdentityRoutingError } from '../contracts/identity-store.js';
import { resolveOAuthCredentialLane } from '../oauth/credentials.js';
import { iamPlatformOAuthCallback, iamPlatformOAuthStart } from '../oauth/iam-platform.js';
import { pkceChallenge, pkceVerifier, randomOAuthState } from '../oauth/pkce.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveLoginPath(identity) {
  return identity.routeRegistry.resolve(identity.app.id, IDENTITY_ROUTE_IDS.LOGIN) || '/auth/login';
}

function resolveKv(env) {
  return env?.SESSION_CACHE || env?.KV || null;
}

function buildPasswordResetService(env, adapter, options = {}) {
  if (options.passwordReset) return options.passwordReset;
  const kv = resolveKv(env);
  if (!kv || !adapter) return null;
  return createPasswordResetService({
    kv,
    findEligibleUser: async (email) => adapter.findUserByEmail(email),
    hashPassword,
    updatePassword: async (userId, hashHex, saltHex) => {
      await adapter.updateUserPassword(userId, hashHex, saltHex);
    },
    sendResetEmail: async ({ email, name, code }) => {
      if (!env?.RESEND_API_KEY) {
        const err = new Error('email_not_configured');
        err.code = 'email_not_configured';
        throw err;
      }
      const company = await adapter.getDefaultCompany().catch(() => null);
      const brand = company?.name || 'Your App';
      const fromEmail = company?.supportEmail || 'hey@inneranimalmedia.com';
      const html = `<p>Hi ${escapeHtml(name)},</p><p>Your ${escapeHtml(brand)} verification code is:</p><p style="font-size:22px;font-weight:700;letter-spacing:4px;">${escapeHtml(code)}</p><p>Enter this on the reset page. Expires in 15 minutes.</p>`;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `${brand} <${fromEmail}>`,
          to: [email],
          subject: 'Your password reset code',
          html,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`resend_failed:${res.status}:${text.slice(0, 120)}`);
      }
    },
  });
}

/**
 * Worker fetch handler for identity API + auth page routing.
 * @param {Request} request
 * @param {{ DB: import('../adapters/cloudflare-d1/index.js').D1Database, ASSETS?: { fetch: (req: Request) => Promise<Response> }, [key: string]: unknown }} env
 * @param {{ identity?: ReturnType<typeof createIdentityService>, brandName?: string }} [options]
 */
export async function handleIdentityWorkerRequest(request, env, options = {}) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  const adapter = createCloudflareD1Adapter(env.DB);
  if (!options.identity && (!options.app?.id || !options.routeRegistry)) {
    throw new IdentityRoutingError(
      'AUTH_APP_UNRESOLVED',
      'handleIdentityWorkerRequest requires options.app + options.routeRegistry',
    );
  }
  const identity = options.identity || createIdentityService({
    adapter,
    app: options.app,
    routeRegistry: options.routeRegistry,
  });
  const loginPath = () => identity.routeRegistry.resolve(identity.app.id, IDENTITY_ROUTE_IDS.LOGIN);
  const signupPath = () => identity.routeRegistry.resolve(identity.app.id, IDENTITY_ROUTE_IDS.SIGNUP)
    || loginPath();
  const resetPath = () => identity.routeRegistry.resolve(identity.app.id, IDENTITY_ROUTE_IDS.RESET)
    || loginPath();
  const passwordReset = buildPasswordResetService(env, adapter, options);

  // ── API: email auth ─────────────────────────────────────────────────────
  if (path === '/api/auth/login' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const result = await identity.loginWithPassword({
      email: body.email,
      password: body.password,
    });
    if (!result.ok) {
      await adapter.logAuthEvent({
        eventType: 'login', status: 'failed', provider: 'email', request,
      });
      return jsonResponse({ ok: false, error: result.error }, 401);
    }
    await adapter.logAuthEvent({
      userId: result.user.id, eventType: 'login', status: 'ok', provider: 'email', request,
    });
    return identity.buildLoginSuccessResponse(request, result.sessionId, body.next);
  }

  if (path === '/api/auth/signup' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const result = await identity.signup({
      email: body.email,
      password: body.password,
      displayName: body.name || body.displayName,
    });
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400);
    }
    return identity.buildLoginSuccessResponse(request, result.sessionId, body.next);
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    const sessionCtx = await identity.sessionFromRequest(request).catch(() => null);
    await identity.logout(request);
    await adapter.logAuthEvent({
      userId: sessionCtx?.user?.id, eventType: 'logout', status: 'ok', request,
    });
    return identity.buildLogoutResponse(request);
  }

  if (path === '/api/auth/me' && method === 'GET') {
    const ctx = await identity.sessionFromRequest(request);
    if (!ctx) return jsonResponse({ ok: false, error: 'session_required' }, 401);
    return jsonResponse({
      ok: true,
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        displayName: ctx.user.display_name,
      },
    });
  }

  if (path === '/api/company' && method === 'GET') {
    const slug = url.searchParams.get('slug') || undefined;
    const company = slug ? await adapter.getCompanyBySlug(slug) : await adapter.getDefaultCompany();
    if (!company) return jsonResponse({ ok: false, error: 'company_not_found' }, 404);
    return jsonResponse({ ok: true, company });
  }

  if (path === '/api/company' && method === 'PATCH') {
    const ctx = await identity.sessionFromRequest(request);
    if (!ctx) return jsonResponse({ ok: false, error: 'session_required' }, 401);
    const body = await request.json().catch(() => ({}));
    const company = await adapter.upsertCompany({
      name: body.name,
      legalName: body.legalName,
      logoUrl: body.logoUrl,
      faviconUrl: body.faviconUrl,
      primaryColor: body.primaryColor,
      authBgColor: body.authBgColor,
      supportEmail: body.supportEmail,
      websiteUrl: body.websiteUrl,
      tagline: body.tagline,
      meta: body.meta,
    });
    return jsonResponse({ ok: true, company });
  }

  if (path === '/api/auth/backup-code' && method === 'POST') {
    return jsonResponse({ ok: false, error: 'backup_code_not_configured' }, 501);
  }

  if (path === '/api/auth/password-reset/request' && method === 'POST') {
    if (!passwordReset) {
      return jsonResponse({ error: 'Service unavailable' }, 503);
    }
    const body = await request.json().catch(() => ({}));
    try {
      const result = await passwordReset.requestReset({ email: body.email });
      return jsonResponse(result);
    } catch (e) {
      if (e?.code === 'email_not_configured' || e?.message === 'email_not_configured') {
        return jsonResponse({ error: 'Email not configured' }, 503);
      }
      console.error('[password-reset/request]', e?.message ?? e);
      return jsonResponse({ error: 'Service unavailable' }, 503);
    }
  }

  if (path === '/api/auth/password-reset/confirm' && method === 'POST') {
    if (!passwordReset) {
      return jsonResponse({ error: 'Service unavailable' }, 503);
    }
    const body = await request.json().catch(() => ({}));
    const result = await passwordReset.confirmReset({
      email: body.email,
      code: body.code,
      password: body.password,
      confirmPassword: body.confirm_password ?? body.confirmPassword ?? body.confirm,
    });
    if (!result.ok) {
      return jsonResponse({ error: result.error }, result.status || 400);
    }
    return jsonResponse({ ok: true, redirect: `${loginPath()}?reset=success` });
  }

  // ── OAuth ────────────────────────────────────────────────────────────────
  // Default: IAM_CLIENT_* (minted). Developer BYOK GOOGLE_*/GITHUB_* take the
  // matching /api/oauth/{provider}/start button when set.
  // Canonical platform id = inneranimalmedia (legacy /api/oauth/iam/* still accepted).
  if (path === '/api/oauth/inneranimalmedia/callback' || path === '/api/oauth/iam/callback') {
    if (method === 'GET') {
      return iamPlatformOAuthCallback(request, env, adapter, identity);
    }
  }
  if (path === '/api/oauth/inneranimalmedia/start' || path === '/api/oauth/iam/start') {
    if (method === 'GET') {
      const lane = resolveOAuthCredentialLane(env, 'inneranimalmedia');
      if (!lane) return jsonResponse({ ok: false, error: 'inneranimalmedia_oauth_not_configured' }, 503);
      return iamPlatformOAuthStart(request, env, adapter, identity);
    }
  }

  if (path === '/api/oauth/google/start' && method === 'GET') {
    const lane = resolveOAuthCredentialLane(env, 'google');
    if (!lane) return jsonResponse({ ok: false, error: 'google_oauth_not_configured' }, 503);
    if (lane.lane === 'iam_platform') return iamPlatformOAuthStart(request, env, adapter, identity);
    return oauthStart(request, env, identity, adapter, 'google', lane);
  }
  if (path === '/api/oauth/github/start' && method === 'GET') {
    const lane = resolveOAuthCredentialLane(env, 'github');
    if (!lane) return jsonResponse({ ok: false, error: 'github_oauth_not_configured' }, 503);
    if (lane.lane === 'iam_platform') return iamPlatformOAuthStart(request, env, adapter, identity);
    return oauthStart(request, env, identity, adapter, 'github', lane);
  }
  if (path === '/api/oauth/cloudflare/start' && method === 'GET') {
    const lane = resolveOAuthCredentialLane(env, 'cloudflare');
    if (!lane) return jsonResponse({ ok: false, error: 'cloudflare_oauth_not_configured' }, 503);
    return oauthStart(request, env, identity, adapter, 'cloudflare', lane);
  }

  if (path === '/api/oauth/google/callback' && method === 'GET') {
    const lane = resolveOAuthCredentialLane(env, 'google');
    if (!lane) {
      return Response.redirect(`${url.origin}${loginPath()}?error=oauth_not_configured`, 302);
    }
    if (lane.lane === 'iam_platform') {
      return iamPlatformOAuthCallback(request, env, adapter, identity);
    }
    return oauthCallback(request, env, identity, adapter, 'google', lane);
  }
  if (path === '/api/oauth/github/callback' && method === 'GET') {
    const lane = resolveOAuthCredentialLane(env, 'github');
    if (!lane) {
      return Response.redirect(`${url.origin}${loginPath()}?error=oauth_not_configured`, 302);
    }
    if (lane.lane === 'iam_platform') {
      return iamPlatformOAuthCallback(request, env, adapter, identity);
    }
    return oauthCallback(request, env, identity, adapter, 'github', lane);
  }
  if (path === '/api/oauth/cloudflare/callback' && method === 'GET') {
    const lane = resolveOAuthCredentialLane(env, 'cloudflare');
    if (!lane) {
      return Response.redirect(`${url.origin}${loginPath()}?error=oauth_not_configured`, 302);
    }
    return oauthCallback(request, env, identity, adapter, 'cloudflare', lane);
  }

  // Auth HTML shells — identity pages only (Worker ASSETS binding, not R2).
  const authPages = new Set([
    loginPath(),
    signupPath(),
    resetPath(),
  ]);

  if (method === 'GET' && authPages.has(path)) {
    if (env.ASSETS?.fetch) {
      const assetUrl = new URL(path, url.origin);
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }
    return jsonResponse({ error: 'assets_binding_required', path }, 500);
  }

  // Product SPA mounts (/agentsam, /admin, /cad, …) are owned by the host app
  // registry — identity does not invent or gate those routes here.

  if (env.ASSETS?.fetch) {
    return env.ASSETS.fetch(request);
  }

  return jsonResponse({ error: 'not_found', path }, 404);
}

async function oauthStart(request, env, identity, adapter, provider, creds) {
  const url = new URL(request.url);
  if (!creds.clientId) {
    return jsonResponse({ ok: false, error: `${provider}_oauth_not_configured` }, 503);
  }
  try {
    const state = randomOAuthState();
    const codeVerifier = pkceVerifier();
    const codeChallenge = await pkceChallenge(codeVerifier);
    const redirectTo = identity.resolvePostLoginPath(
      url.searchParams.get('next') || url.searchParams.get('return_to'),
    );
    await adapter.saveOAuthState({
      state,
      provider,
      codeVerifier,
      redirectTo,
      appId: identity.app?.id || null,
    });

    const redirectUri = `${url.origin}/api/oauth/${provider}/callback`;
    let authUrl;
    if (provider === 'google') {
      authUrl = getGoogleAuthUrl({
        clientId: creds.clientId,
        redirectUri,
        state,
        codeChallenge,
      });
    } else if (provider === 'cloudflare') {
      authUrl = getCloudflareAuthUrl({
        clientId: creds.clientId,
        redirectUri,
        state,
        codeChallenge,
      });
    } else {
      authUrl = getGithubAuthUrl({
        clientId: creds.clientId,
        redirectUri,
        state,
        codeChallenge,
      });
    }
    return Response.redirect(authUrl, 302);
  } catch (error) {
    const message = String(error?.message || error || 'oauth_start_failed');
    console.error('oauth_start_failed', provider, message);
    // Prefer redirect to login with error over bare Worker 1101 for browsers.
    const lp = identity.routeRegistry.resolve(identity.app.id, IDENTITY_ROUTE_IDS.LOGIN);
    const login = new URL(lp, url.origin);
    login.searchParams.set('error', 'oauth_start_failed');
    login.searchParams.set('provider', provider);
    login.searchParams.set('detail', message.slice(0, 120));
    const next = url.searchParams.get('next') || url.searchParams.get('return_to');
    if (next) login.searchParams.set('next', next);
    return Response.redirect(login.toString(), 302);
  }
}

async function oauthCallback(request, env, identity, adapter, provider, creds) {
  const url = new URL(request.url);
  const login = resolveLoginPath(identity);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const err = url.searchParams.get('error');
  if (err || !code || !state) {
    await adapter.logAuthEvent({ eventType: 'login', status: 'failed', provider, request, metadata: { reason: 'oauth_failed' } });
    return Response.redirect(`${url.origin}${login}?error=oauth_failed`, 302);
  }
  const saved = await adapter.consumeOAuthState(state);
  if (!saved || saved.provider !== provider) {
    await adapter.logAuthEvent({ eventType: 'login', status: 'failed', provider, request, metadata: { reason: 'state_mismatch' } });
    return Response.redirect(`${url.origin}${login}?error=state_mismatch`, 302);
  }
  const redirectUri = `${url.origin}/api/oauth/${provider}/callback`;
  let token;
  let profile;
  if (provider === 'google') {
    token = await exchangeGoogleCode({
      code,
      codeVerifier: saved.code_verifier,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      redirectUri,
    });
    if (!token?.access_token) {
      return Response.redirect(`${url.origin}${login}?error=token_exchange_failed`, 302);
    }
    profile = await fetchGoogleProfile(token.access_token);
  } else if (provider === 'cloudflare') {
    token = await exchangeCloudflareCode({
      code,
      codeVerifier: saved.code_verifier,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      redirectUri,
    });
    if (!token?.access_token) {
      return Response.redirect(`${url.origin}${login}?error=token_exchange_failed`, 302);
    }
    profile = await fetchCloudflareProfile(token.access_token);
  } else {
    token = await exchangeGithubCode({
      code,
      codeVerifier: saved.code_verifier,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      redirectUri,
    });
    if (!token?.access_token) {
      return Response.redirect(`${url.origin}${login}?error=token_exchange_failed`, 302);
    }
    profile = await fetchGithubProfile(token.access_token);
  }
  if (!profile) {
    return Response.redirect(`${url.origin}${login}?error=userinfo_failed`, 302);
  }

  let normalized;
  if (provider === 'google') {
    normalized = { subject: profile.sub, email: profile.email, name: profile.name };
  } else if (provider === 'cloudflare') {
    normalized = { subject: String(profile.sub), email: profile.email, name: profile.name || profile.email };
  } else {
    normalized = { subject: String(profile.id), email: profile.email, name: profile.name || profile.login };
  }

  const result = await identity.provisionOAuthUser({
    provider,
    providerSubject: normalized.subject,
    email: normalized.email,
    displayName: normalized.name,
  });
  await adapter.logAuthEvent({
    userId: result.authUserId, eventType: 'login', status: 'ok', provider, request,
  });

  const redirectTo = identity.resolvePostLoginPath(saved.redirect_to);
  const res = identity.buildLoginSuccessResponse(request, result.sessionId, redirectTo);
  const globeUrl = `${url.origin}${login}?globe_exit=1&next=${encodeURIComponent(redirectTo)}`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: globeUrl,
      'Set-Cookie': res.headers.get('Set-Cookie') || '',
    },
  });
}

export { createIdentityService, createCloudflareD1Adapter };
