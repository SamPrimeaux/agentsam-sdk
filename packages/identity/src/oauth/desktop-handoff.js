import { SESSION_POLICY } from '../core/constants.js';
import { jsonResponse } from '../core/http-json.js';
import { pkceChallenge } from './pkce.js';

export const DESKTOP_CLIENT_ID = 'local-studio';
export const DESKTOP_REDIRECT_URI = 'agentsamstudio://callback';
export const DESKTOP_HANDOFF_TTL_SECONDS = 120;
export const DESKTOP_REFRESH_TTL_SECONDS = 90 * 24 * 60 * 60;

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function randomOpaqueToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return btoa(String.fromCharCode(...value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function hashToken(value) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(String(value || '')),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function validOpaque(value, min = 32, max = 256) {
  const text = String(value || '');
  return text.length >= min && text.length <= max && BASE64URL_RE.test(text);
}

function noStoreJson(data, status = 200) {
  const response = jsonResponse(data, status);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Pragma', 'no-cache');
  return response;
}

export function readDesktopOAuthIntent(url) {
  if (url.searchParams.get('desktop') !== '1') return null;
  const desktopState = url.searchParams.get('desktop_state') || '';
  const codeChallenge = url.searchParams.get('desktop_code_challenge') || '';
  const clientId = url.searchParams.get('desktop_client_id') || '';
  const redirectUri = url.searchParams.get('desktop_redirect_uri') || '';
  if (
    !validOpaque(desktopState)
    || !validOpaque(codeChallenge, 43, 128)
    || clientId !== DESKTOP_CLIENT_ID
    || redirectUri !== DESKTOP_REDIRECT_URI
  ) {
    const error = new Error('invalid_desktop_oauth_request');
    error.code = 'invalid_desktop_oauth_request';
    throw error;
  }
  return { desktopState, codeChallenge, clientId, redirectUri };
}

export async function saveDesktopOAuthIntent(adapter, oauthState, url) {
  const intent = readDesktopOAuthIntent(url);
  if (!intent) return null;
  await adapter.saveDesktopOAuthIntent({
    oauthState,
    ...intent,
    ttlSeconds: 10 * 60,
  });
  return intent;
}

export async function finishDesktopOAuth({ adapter, oauthState, sessionId, provider }) {
  const intent = await adapter.consumeDesktopOAuthIntent(oauthState);
  if (!intent) return null;
  const code = randomOpaqueToken();
  await adapter.createDesktopHandoff({
    codeHash: await hashToken(code),
    stateHash: await hashToken(intent.desktop_state),
    sessionId,
    provider,
    clientId: intent.client_id,
    redirectUri: intent.redirect_uri,
    codeChallenge: intent.code_challenge,
    ttlSeconds: DESKTOP_HANDOFF_TTL_SECONDS,
  });
  const callback = new URL(intent.redirect_uri);
  callback.searchParams.set('code', code);
  callback.searchParams.set('state', intent.desktop_state);
  return Response.redirect(callback.toString(), 302);
}

async function readJson(request) {
  if (request.method !== 'POST') return null;
  return request.json().catch(() => null);
}

export async function handleDesktopExchangeRequest(request, adapter) {
  const body = await readJson(request);
  if (!body) return noStoreJson({ ok: false, error: 'method_not_allowed' }, 405);
  const code = String(body.code || '');
  const state = String(body.state || '');
  const verifier = String(body.code_verifier || '');
  const clientId = String(body.client_id || '');
  const redirectUri = String(body.redirect_uri || '');
  if (
    !validOpaque(code)
    || !validOpaque(state)
    || !validOpaque(verifier, 43, 128)
    || clientId !== DESKTOP_CLIENT_ID
    || redirectUri !== DESKTOP_REDIRECT_URI
  ) {
    return noStoreJson({ ok: false, error: 'invalid_request' }, 400);
  }

  const handoff = await adapter.consumeDesktopHandoff({
    codeHash: await hashToken(code),
    stateHash: await hashToken(state),
    clientId,
    redirectUri,
  });
  if (!handoff) return noStoreJson({ ok: false, error: 'invalid_or_expired_code' }, 400);
  const actualChallenge = await pkceChallenge(verifier);
  if (actualChallenge !== handoff.code_challenge) {
    return noStoreJson({ ok: false, error: 'pkce_verification_failed' }, 400);
  }
  const session = await adapter.getSession(handoff.session_id);
  if (!session) return noStoreJson({ ok: false, error: 'session_expired' }, 401);

  const refreshToken = randomOpaqueToken(48);
  await adapter.createDesktopRefreshToken({
    tokenHash: await hashToken(refreshToken),
    userId: session.user_id,
    provider: handoff.provider,
    clientId,
    ttlSeconds: DESKTOP_REFRESH_TTL_SECONDS,
  });
  return noStoreJson({
    ok: true,
    token_type: 'Bearer',
    access_token: session.id,
    refresh_token: refreshToken,
    expires_in: Math.max(0, Number(session.expires_at) - Math.floor(Date.now() / 1000)),
    provider: handoff.provider,
    account: {
      id: session.user_id,
      email: session.email || null,
      name: session.display_name || null,
    },
  });
}
export async function handleDesktopRefreshRequest(request, adapter) {
  const body = await readJson(request);
  if (!body) return noStoreJson({ ok: false, error: 'method_not_allowed' }, 405);
  const refreshToken = String(body.refresh_token || '');
  const clientId = String(body.client_id || '');
  if (!validOpaque(refreshToken, 43, 256) || clientId !== DESKTOP_CLIENT_ID) {
    return noStoreJson({ ok: false, error: 'invalid_request' }, 400);
  }

  const nextRefreshToken = randomOpaqueToken(48);
  const nextRefreshHash = await hashToken(nextRefreshToken);
  const grant = await adapter.consumeDesktopRefreshToken({
    tokenHash: await hashToken(refreshToken),
    clientId,
    replacedByHash: nextRefreshHash,
  });
  if (!grant) return noStoreJson({ ok: false, error: 'invalid_refresh_token' }, 401);
  const user = await adapter.findUserById(grant.user_id);
  if (!user) return noStoreJson({ ok: false, error: 'account_not_found' }, 401);
  const session = await adapter.createSession({
    userId: user.id,
    email: user.email,
    displayName: user.display_name,
    provider: grant.provider,
  });
  await adapter.createDesktopRefreshToken({
    tokenHash: nextRefreshHash,
    userId: user.id,
    provider: grant.provider,
    clientId,
    ttlSeconds: DESKTOP_REFRESH_TTL_SECONDS,
  });
  return noStoreJson({
    ok: true,
    token_type: 'Bearer',
    access_token: session.id,
    refresh_token: nextRefreshToken,
    expires_in: SESSION_POLICY.browser.ttlSeconds,
    provider: grant.provider,
    account: { id: user.id, email: user.email || null, name: user.display_name || null },
  });
}

export async function handleDesktopSessionRequest(request, identity) {
  if (request.method !== 'GET') return noStoreJson({ ok: false, error: 'method_not_allowed' }, 405);
  const context = await identity.sessionFromRequest(request);
  if (!context) return noStoreJson({ ok: false, error: 'unauthorized' }, 401);
  return noStoreJson({
    ok: true,
    authenticated: true,
    provider: context.session.provider || null,
    account: {
      id: context.user.id,
      email: context.user.email || null,
      name: context.user.display_name || null,
    },
    expires_at: context.session.expires_at,
  });
}
