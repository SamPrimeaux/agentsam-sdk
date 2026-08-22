import { createCloudflareD1Adapter } from '../adapters/cloudflare-d1/index.js';
import { createIdentityService } from './identity-service.js';
import { jsonResponse } from '../core/http-json.js';
import { hashPassword } from '../core/password-crypto.js';
import { createPasswordResetService } from '../recovery/password-reset.js';
import { AUTH_LOGIN_PATH } from '../core/constants.js';
import { resolveIamPlatformCredentials } from '../oauth/credentials.js';
import { iamPlatformOAuthCallback, iamPlatformOAuthStart } from '../oauth/iam-platform.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  const identity = options.identity || createIdentityService({ adapter });
  const passwordReset = buildPasswordResetService(env, adapter, options);

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
    return jsonResponse({ ok: true, redirect: `${AUTH_LOGIN_PATH}?reset=success` });
  }

  // ── OAuth (IAM platform — IAM_CLIENT_ID + IAM_CLIENT_SECRET required) ───
  if (path === '/api/oauth/iam/callback' && method === 'GET') {
    return iamPlatformOAuthCallback(request, env, adapter, identity);
  }

  if (
    (path === '/api/oauth/google/start' || path === '/api/oauth/github/start')
    && method === 'GET'
  ) {
    if (!resolveIamPlatformCredentials(env)) {
      return jsonResponse({ ok: false, error: 'iam_oauth_not_configured' }, 503);
    }
    return iamPlatformOAuthStart(request, env, adapter);
  }

  if (
    (path === '/api/oauth/google/callback' || path === '/api/oauth/github/callback')
    && method === 'GET'
  ) {
    return iamPlatformOAuthCallback(request, env, adapter, identity);
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

export { createIdentityService, createCloudflareD1Adapter };
