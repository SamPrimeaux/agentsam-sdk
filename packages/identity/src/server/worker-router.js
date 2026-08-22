import { createCloudflareD1Adapter } from '../adapters/cloudflare-d1/index.js';
import { createIdentityService } from './identity-service.js';
import { jsonResponse } from '../core/http-json.js';
import { getGoogleAuthUrl, exchangeGoogleCode } from '../providers/google/oauth.js';
import { fetchGoogleProfile } from '../providers/google/profile.js';
import { getGithubAuthUrl, exchangeGithubCode } from '../providers/github/oauth.js';
import { fetchGithubProfile } from '../providers/github/profile.js';
import { AUTH_LOGIN_PATH } from '../core/constants.js';

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pkceChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return b64;
}

function pkceVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
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
  const identity = options.identity || createIdentityService({ adapter });

  // ── API: email auth ─────────────────────────────────────────────────────
  if (path === '/api/auth/login' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const result = await identity.loginWithPassword({
      email: body.email,
      password: body.password,
    });
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 401);
    }
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
    await identity.logout(request);
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
    return jsonResponse({ ok: true, message: 'If an account exists, a reset link was sent.' });
  }

  if (path === '/api/auth/password-reset/confirm' && method === 'POST') {
    return jsonResponse({ ok: true, redirect: `${AUTH_LOGIN_PATH}?reset=success` });
  }

  // ── OAuth start ───────────────────────────────────────────────────────────
  if (path === '/api/oauth/google/start' && method === 'GET') {
    return oauthStart(request, env, adapter, 'google', {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    });
  }
  if (path === '/api/oauth/github/start' && method === 'GET') {
    return oauthStart(request, env, adapter, 'github', {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    });
  }

  if (path === '/api/oauth/google/callback' && method === 'GET') {
    return oauthCallback(request, env, identity, adapter, 'google', {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    });
  }
  if (path === '/api/oauth/github/callback' && method === 'GET') {
    return oauthCallback(request, env, identity, adapter, 'github', {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    });
  }

  // ── Auth HTML shells (map IAM paths → static files) ─────────────────────
  const authPageMap = {
    '/auth/login': '/auth/login.html',
    '/auth/signup': '/auth/signup.html',
    '/auth/reset': '/auth/reset.html',
    '/dashboard/home': '/dashboard/index.html',
    '/dashboard/agent': '/dashboard/index.html',
    '/dashboard': '/dashboard/index.html',
  };

  if (method === 'GET' && authPageMap[path]) {
    if (env.ASSETS?.fetch) {
      const assetUrl = new URL(authPageMap[path], url.origin);
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }
    return jsonResponse({ error: 'assets_binding_required', path }, 500);
  }

  if (method === 'GET' && path.startsWith('/dashboard')) {
    const ctx = await identity.sessionFromRequest(request);
    if (!ctx) {
      const next = encodeURIComponent(path + url.search);
      return Response.redirect(`${url.origin}${AUTH_LOGIN_PATH}?next=${next}`, 302);
    }
    if (env.ASSETS?.fetch) {
      const assetUrl = new URL('/dashboard/index.html', url.origin);
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }
  }

  if (env.ASSETS?.fetch) {
    return env.ASSETS.fetch(request);
  }

  return jsonResponse({ error: 'not_found', path }, 404);
}

async function oauthStart(request, env, adapter, provider, creds) {
  const url = new URL(request.url);
  if (!creds.clientId) {
    return jsonResponse({ ok: false, error: `${provider}_oauth_not_configured` }, 503);
  }
  const state = randomState();
  const codeVerifier = pkceVerifier();
  const codeChallenge = await pkceChallenge(codeVerifier);
  const redirectTo = url.searchParams.get('next') || url.searchParams.get('return_to') || '/dashboard/home';
  await adapter.saveOAuthState({ state, provider, codeVerifier, redirectTo });

  const origin = url.origin;
  const callbackPath = `/api/oauth/${provider}/callback`;
  const redirectUri = `${origin}${callbackPath}`;

  let authUrl;
  if (provider === 'google') {
    authUrl = getGoogleAuthUrl({
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
}

async function oauthCallback(request, env, identity, adapter, provider, creds) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const err = url.searchParams.get('error');
  if (err || !code || !state) {
    return Response.redirect(`${url.origin}${AUTH_LOGIN_PATH}?error=oauth_failed`, 302);
  }
  const saved = await adapter.consumeOAuthState(state);
  if (!saved || saved.provider !== provider) {
    return Response.redirect(`${url.origin}${AUTH_LOGIN_PATH}?error=state_mismatch`, 302);
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
      return Response.redirect(`${url.origin}${AUTH_LOGIN_PATH}?error=token_exchange_failed`, 302);
    }
    profile = await fetchGoogleProfile(token.access_token);
  } else {
    token = await exchangeGithubCode({
      code,
      codeVerifier: saved.code_verifier,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      redirectUri,
    });
    if (!token?.access_token) {
      return Response.redirect(`${url.origin}${AUTH_LOGIN_PATH}?error=token_exchange_failed`, 302);
    }
    profile = await fetchGithubProfile(token.access_token);
  }
  if (!profile) {
    return Response.redirect(`${url.origin}${AUTH_LOGIN_PATH}?error=userinfo_failed`, 302);
  }

  const normalized = provider === 'google'
    ? { subject: profile.sub, email: profile.email, name: profile.name }
    : { subject: String(profile.id), email: profile.email, name: profile.name || profile.login };

  const result = await identity.provisionOAuthUser({
    provider,
    providerSubject: normalized.subject,
    email: normalized.email,
    displayName: normalized.name,
  });

  const redirectTo = saved.redirect_to || '/dashboard/home';
  const res = identity.buildLoginSuccessResponse(request, result.sessionId, redirectTo);
  const globeUrl = `${url.origin}${AUTH_LOGIN_PATH}?globe_exit=1&next=${encodeURIComponent(redirectTo)}`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: globeUrl,
      'Set-Cookie': res.headers.get('Set-Cookie') || '',
    },
  });
}

export { createIdentityService, createCloudflareD1Adapter };
