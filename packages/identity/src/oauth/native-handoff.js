/**
 * Native (desktop) OAuth handoff.
 *
 * A desktop app signs in through the system browser, so the provider redirect
 * lands in a browser that cannot hand a Set-Cookie to the app. Instead:
 *
 *   start    GET  /api/oauth/{provider}/start?client=native
 *                   &native_challenge=<S256(verifier)>&native_redirect=<deep link>
 *   callback creates an auth_sessions row (type=desktop), stores a single-use
 *            handoff bound to the PKCE challenge, and 302s to the deep link
 *            with ?handoff=<one-time code> — the session id never rides a URL.
 *   exchange POST /api/oauth/native/exchange { handoff, code_verifier }
 *            → same JSON as native password login (session_id, expires_at, user)
 *
 * Identity only. This never writes provider resource grants (user_oauth_tokens).
 */

import { jsonResponse } from '../core/http-json.js';
import { NATIVE_HANDOFF_TTL_SECONDS, SESSION_TYPES } from '../core/session-policy.js';
import { pkceChallenge, randomOAuthState } from './pkce.js';

const DEFAULT_NATIVE_SCHEMES = ['agentsamstudio'];
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const S256_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export const NATIVE_EXCHANGE_PATH = '/api/oauth/native/exchange';

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function allowedSchemes(env) {
  const configured = String(env?.IDENTITY_NATIVE_REDIRECT_SCHEMES || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_NATIVE_SCHEMES;
}

/** Deep-link scheme allowlist, or an http loopback redirect. Never a web origin. */
export function isAllowedNativeRedirect(uri, env) {
  let parsed;
  try {
    parsed = new URL(String(uri || ''));
  } catch {
    return false;
  }
  if (parsed.protocol === 'http:') return LOOPBACK_HOSTS.has(parsed.hostname);
  return allowedSchemes(env).includes(parsed.protocol.replace(/:$/, '').toLowerCase());
}

/**
 * Read native params off an OAuth start URL.
 * @returns {{ native: false } | { native: true, error: string } |
 *           { native: true, clientType: 'desktop', nativeChallenge: string, nativeRedirect: string }}
 */
export function parseNativeStart(url, env) {
  const client = String(url.searchParams.get('client') || '').toLowerCase();
  if (client !== 'native' && client !== 'desktop') return { native: false };
  const nativeChallenge = url.searchParams.get('native_challenge') || '';
  const nativeRedirect = url.searchParams.get('native_redirect') || '';
  if (!S256_CHALLENGE.test(nativeChallenge)) return { native: true, error: 'native_challenge_invalid' };
  if (!isAllowedNativeRedirect(nativeRedirect, env)) return { native: true, error: 'native_redirect_not_allowed' };
  return { native: true, clientType: SESSION_TYPES.DESKTOP, nativeChallenge, nativeRedirect };
}

/** Session type an OAuth transaction should mint. */
export function sessionTypeForTransaction(saved) {
  return saved?.client_type === SESSION_TYPES.DESKTOP ? SESSION_TYPES.DESKTOP : SESSION_TYPES.BROWSER;
}

/**
 * Shared callback tail for every OAuth lane. Browser transactions keep the
 * existing cookie + globe redirect; native transactions get the handoff redirect.
 */
export async function finishOAuthLogin({ request, env, identity, adapter, saved, result, loginPath }) {
  const url = new URL(request.url);
  const redirectTo = identity.resolvePostLoginPath(saved?.redirect_to);

  if (sessionTypeForTransaction(saved) === SESSION_TYPES.DESKTOP) {
    if (!saved.native_challenge || !isAllowedNativeRedirect(saved.native_redirect, env)) {
      await adapter.revokeSession?.(result.sessionId);
      return Response.redirect(`${url.origin}${loginPath}?error=native_handoff_invalid`, 302);
    }
    const handoff = randomOAuthState();
    await adapter.createNativeHandoff({
      handoffHash: await sha256Hex(handoff),
      sessionId: result.sessionId,
      challenge: saved.native_challenge,
      ttlSeconds: NATIVE_HANDOFF_TTL_SECONDS,
    });
    const target = new URL(saved.native_redirect);
    target.searchParams.set('handoff', handoff);
    return new Response(null, {
      status: 302,
      headers: { Location: target.toString(), 'Cache-Control': 'no-store' },
    });
  }

  const res = identity.buildLoginSuccessResponse(request, result.sessionId, redirectTo);
  const globeUrl = `${url.origin}${loginPath}?globe_exit=1&next=${encodeURIComponent(redirectTo)}`;
  return new Response(null, {
    status: 302,
    headers: { Location: globeUrl, 'Set-Cookie': res.headers.get('Set-Cookie') || '' },
  });
}

/** POST /api/oauth/native/exchange — single-use, PKCE-bound. */
export async function handleNativeExchangeRequest(request, { adapter, identity }) {
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }
  const handoff = String(body?.handoff || '').trim();
  const verifier = String(body?.code_verifier || body?.codeVerifier || '').trim();
  if (!handoff || !verifier) {
    return jsonResponse({ ok: false, error: 'handoff_and_code_verifier_required' }, 400);
  }

  // Consumed before the verifier check, so a wrong verifier burns the code.
  const row = await adapter.consumeNativeHandoff(await sha256Hex(handoff));
  if (!row) return jsonResponse({ ok: false, error: 'handoff_invalid_or_expired' }, 400);
  if ((await pkceChallenge(verifier)) !== row.challenge) {
    await adapter.revokeSession?.(row.session_id);
    return jsonResponse({ ok: false, error: 'pkce_verification_failed' }, 400);
  }

  const session = await adapter.getSession(row.session_id);
  const user = session ? await adapter.findUserById(session.user_id) : null;
  if (!session || !user) return jsonResponse({ ok: false, error: 'session_unavailable' }, 401);
  return identity.buildNativeLoginSuccessResponse({ sessionId: session.id, session, user }, body?.next);
}
