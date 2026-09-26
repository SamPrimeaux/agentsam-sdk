/**
 * Server-side Google token exchange for CLI desktop PKCE.
 *
 * Desktop/"installed" OAuth clients must be type Desktop in Google Console (no secret).
 * If the configured desktop client_id was created as a Web client, Google demands a secret.
 * Secrets never leave the Worker: GOOGLE_DESKTOP_CLIENT_SECRET (optional) or GOOGLE_CLIENT_SECRET
 * when client_id matches the web client.
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
  const desktopId = clean(env.GOOGLE_DESKTOP_CLIENT_ID);
  const webId = clean(env.GOOGLE_CLIENT_ID);
  const desktopSecret = clean(env.GOOGLE_DESKTOP_CLIENT_SECRET);
  const webSecret = clean(env.GOOGLE_CLIENT_SECRET);

  if (id && desktopId && id === desktopId && desktopSecret) {
    return { clientId: id, clientSecret: desktopSecret, mode: 'desktop_with_optional_secret' };
  }
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
    [clean(env.GOOGLE_DESKTOP_CLIENT_ID), clean(env.GOOGLE_CLIENT_ID)].filter(Boolean),
  );
  if (!allowed.has(clientId)) {
    return json({ ok: false, error: 'client_id_not_configured_on_host' }, 403);
  }

  const resolved = resolveGoogleExchangeSecret(env, clientId);
  if (resolved.mode === 'unknown_client') {
    return json({ ok: false, error: 'client_id_not_configured_on_host' }, 403);
  }

  const fetchImpl = opts.fetchImpl || fetch;
  let result = await exchangeGoogleAuthorizationCode({
    code,
    codeVerifier,
    clientId,
    redirectUri,
    clientSecret: resolved.clientSecret,
    fetchImpl,
  });

  // If public desktop exchange fails because Google treats the client as confidential,
  // retry once when an optional desktop secret is available (mis-typed Web client).
  const detail = String(result.data?.error_description || result.data?.error || '');
  if (
    !result.ok
    && /client_secret/i.test(detail)
    && resolved.mode === 'desktop_public_pkce'
    && !resolved.clientSecret
  ) {
    return json({
      ok: false,
      error: 'desktop_client_requires_secret',
      detail,
      remediation: [
        'In Google Cloud Console create OAuth client type Desktop app (no secret) and set GOOGLE_DESKTOP_CLIENT_ID to that client id.',
        'Or if this client id is a Web app, put its secret on the Worker: wrangler secret put GOOGLE_DESKTOP_CLIENT_SECRET',
        'Web browser login continues to use GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.',
      ],
    }, 502);
  }

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
