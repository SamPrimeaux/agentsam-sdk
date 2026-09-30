import { fetchGoogleProfile } from '../providers/google/profile.js';
import { SESSION_TYPES } from '../core/session-policy.js';

/**
 * Server-side Google token exchange for CLI / desktop PKCE.
 *
 * Desktop/"installed" OAuth clients are public PKCE clients and never use an
 * AgentSam desktop client-secret configuration. The hosted web client remains
 * confidential and uses GOOGLE_CLIENT_SECRET.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function isLoopbackRedirect(uri) {
  try {
    const u = new URL(String(uri || ''));
    if (u.protocol !== 'http:') return false;
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Resolve which secret (if any) the Worker may attach for this client_id.
 */
export function resolveGoogleExchangeSecret(env, clientId) {
  const id = clean(clientId);
  const desktopId = clean(env?.GOOGLE_DESKTOP_CLIENT_ID);
  const webId = clean(env?.GOOGLE_CLIENT_ID);
  const webSecret = clean(env?.GOOGLE_CLIENT_SECRET);

  if (id && webId && id === webId && webSecret) {
    return { clientId: id, clientSecret: webSecret, mode: 'web_confidential' };
  }
  if (id && desktopId && id === desktopId) {
    return { clientId: id, clientSecret: null, mode: 'desktop_public_pkce' };
  }
  return { clientId: id || null, clientSecret: null, mode: 'unknown_client' };
}

export async function exchangeGoogleAuthorizationCode({
  code,
  codeVerifier,
  clientId,
  redirectUri,
  clientSecret = null,
  fetchImpl = fetch,
} = {}) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: clean(code),
    code_verifier: clean(codeVerifier),
    client_id: clean(clientId),
    redirect_uri: clean(redirectUri),
  });
  if (clean(clientSecret)) body.set('client_secret', clean(clientSecret));

  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && Boolean(data.access_token), status: res.status, data };
}

/**
 * POST /api/oauth/google/desktop-exchange
 * Body JSON: { code, code_verifier, redirect_uri, client_id }
 */
export async function handleGoogleDesktopExchangeRequest(request, env, opts = {}) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const code = clean(payload.code);
  const codeVerifier = clean(payload.code_verifier || payload.codeVerifier);
  const redirectUri = clean(payload.redirect_uri || payload.redirectUri);
  const clientId = clean(payload.client_id || payload.clientId);

  if (!code || !codeVerifier || !redirectUri || !clientId) {
    return json({
      ok: false,
      error: 'code_code_verifier_redirect_uri_client_id_required',
    }, 400);
  }
  if (!isLoopbackRedirect(redirectUri)) {
    return json({ ok: false, error: 'redirect_uri_must_be_loopback' }, 400);
  }

  const allowed = new Set(
    [clean(env?.GOOGLE_DESKTOP_CLIENT_ID), clean(env?.GOOGLE_CLIENT_ID)].filter(Boolean),
  );
  if (!allowed.has(clientId)) {
    return json({ ok: false, error: 'client_id_not_configured_on_host' }, 403);
  }

  const resolved = resolveGoogleExchangeSecret(env, clientId);
  if (resolved.mode === 'unknown_client') {
    return json({ ok: false, error: 'client_id_not_configured_on_host' }, 403);
  }

  const fetchImpl = opts.fetchImpl || fetch;
  const result = await exchangeGoogleAuthorizationCode({
    code,
    codeVerifier,
    clientId,
    redirectUri,
    clientSecret: resolved.clientSecret,
    fetchImpl,
  });

  const detail = String(result.data?.error_description || result.data?.error || '');
  if (!result.ok) {
    return json({
      ok: false,
      error: 'google_token_exchange_failed',
      detail: detail || `http_${result.status}`,
    }, 502);
  }

  return json({
    ok: true,
    access_token: result.data.access_token,
    refresh_token: result.data.refresh_token || null,
    token_type: result.data.token_type || 'Bearer',
    expires_in: result.data.expires_in || null,
    scope: result.data.scope || null,
    exchange_mode: resolved.mode,
  });
}


export const GOOGLE_DESKTOP_LOGIN_EXCHANGE_PATH = '/api/oauth/google/desktop-login-exchange';
const GOOGLE_ID_TOKEN_INFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

async function verifyGoogleDesktopIdToken(idToken, clientId, fetchImpl = fetch) {
  const url = new URL(GOOGLE_ID_TOKEN_INFO_URL);
  url.searchParams.set('id_token', clean(idToken));
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: 'google_id_token_invalid',
      detail: clean(data.error_description || data.error),
    };
  }

  const audience = clean(data.aud);
  const issuer = clean(data.iss);
  const expiresAt = Number(data.exp || 0);
  const emailVerified = data.email_verified === true || String(data.email_verified) === 'true';

  if (audience !== clean(clientId)) {
    return { ok: false, error: 'google_id_token_audience_mismatch' };
  }
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(issuer)) {
    return { ok: false, error: 'google_id_token_issuer_invalid' };
  }
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return { ok: false, error: 'google_id_token_expired' };
  }
  if (!emailVerified) {
    return { ok: false, error: 'google_email_not_verified' };
  }

  return { ok: true, data };
}

/**
 * Google Desktop account identity handoff.
 *
 * The installed app is the public OAuth client. It performs Google
 * Authorization Code + PKCE + loopback and exchanges the authorization code
 * directly with Google. This endpoint never receives the PKCE verifier and
 * never needs a desktop client secret; it validates the transient Google ID
 * token against GOOGLE_DESKTOP_CLIENT_ID, resolves the profile, and mints the
 * normal AgentSam desktop session.
 */
export async function handleGoogleDesktopLoginExchangeRequest(request, env, opts = {}) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }
  const identity = opts.identity;
  const adapter = opts.adapter;
  if (!identity || !adapter) {
    return json({ ok: false, error: 'identity_service_unavailable' }, 503);
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const accessToken = clean(payload.access_token || payload.accessToken);
  const idToken = clean(payload.id_token || payload.idToken);
  const clientId = clean(payload.client_id || payload.clientId);
  if (!accessToken || !idToken || !clientId) {
    return json({
      ok: false,
      error: 'access_token_id_token_client_id_required',
    }, 400);
  }

  const desktopId = clean(env?.GOOGLE_DESKTOP_CLIENT_ID);
  if (!desktopId || clientId !== desktopId) {
    return json({ ok: false, error: 'google_desktop_client_id_required' }, 403);
  }

  const verified = await verifyGoogleDesktopIdToken(
    idToken,
    clientId,
    opts.fetchImpl || fetch,
  );
  if (!verified.ok) {
    return json({
      ok: false,
      error: verified.error,
      detail: verified.detail || null,
    }, 401);
  }

  const profile = opts.fetchProfile
    ? await opts.fetchProfile(accessToken)
    : await fetchGoogleProfile(accessToken);
  if (!profile?.sub) {
    return json({ ok: false, error: 'google_userinfo_failed' }, 502);
  }
  if (clean(verified.data.sub) && clean(verified.data.sub) !== clean(profile.sub)) {
    return json({ ok: false, error: 'google_subject_mismatch' }, 401);
  }
  if (
    clean(verified.data.email) &&
    clean(profile.email) &&
    clean(verified.data.email).toLowerCase() !== clean(profile.email).toLowerCase()
  ) {
    return json({ ok: false, error: 'google_email_mismatch' }, 401);
  }

  const provisioned = await identity.provisionOAuthUser({
    provider: 'google',
    providerSubject: String(profile.sub),
    email: profile.email || verified.data.email || null,
    displayName: profile.name || profile.email || verified.data.email || null,
    sessionType: SESSION_TYPES.DESKTOP,
  });
  const user = await adapter.findUserById(provisioned.authUserId);
  await adapter.logAuthEvent?.({
    userId: provisioned.authUserId,
    eventType: 'login',
    status: 'ok',
    provider: 'google',
    request,
    metadata: {
      session_type: SESSION_TYPES.DESKTOP,
      oauth_client_type: 'desktop_public_pkce',
    },
  });

  return json({
    ok: true,
    authenticated: true,
    session_id: provisioned.sessionId,
    expires_at: provisioned.session?.expires_at ?? null,
    user: user ? {
      id: user.id,
      email: user.email ?? null,
      displayName: user.display_name ?? profile.name ?? null,
    } : null,
    exchange_mode: 'desktop_public_pkce_native_exchange',
  });
}
