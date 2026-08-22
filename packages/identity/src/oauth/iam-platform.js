import { AUTH_LOGIN_PATH } from '../core/constants.js';
import {
  IAM_PLATFORM_CALLBACK_PATH,
  IAM_PLATFORM_STATE_PROVIDER,
  resolveIamPlatformCredentials,
} from './credentials.js';
import { pkceChallenge, pkceVerifier, randomOAuthState } from './pkce.js';

/**
 * @param {{ issuer: string, clientId: string, clientSecret: string, code: string, codeVerifier: string, redirectUri: string }} input
 */
export async function exchangeIamPlatformCode(input) {
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', input.code || '');
  body.set('code_verifier', input.codeVerifier || '');
  body.set('client_id', input.clientId || '');
  body.set('client_secret', input.clientSecret || '');
  body.set('redirect_uri', input.redirectUri || '');

  const res = await fetch(`${input.issuer}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * @param {{ issuer: string, accessToken: string }} input
 */
export async function fetchIamPlatformUserinfo(input) {
  const res = await fetch(`${input.issuer}/api/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Redirect browser to IAM /api/oauth/authorize (PKCE).
 * @param {Request} request
 * @param {Record<string, unknown>} env
 * @param {import('../adapters/cloudflare-d1/index.js').CloudflareD1Adapter} adapter
 */
export async function iamPlatformOAuthStart(request, env, adapter) {
  const creds = resolveIamPlatformCredentials(env);
  if (!creds) {
    return Response.json({ ok: false, error: 'iam_oauth_not_configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const state = randomOAuthState();
  const codeVerifier = pkceVerifier();
  const codeChallenge = await pkceChallenge(codeVerifier);
  const redirectTo = url.searchParams.get('next')
    || url.searchParams.get('return_to')
    || '/dashboard/home';

  await adapter.saveOAuthState({
    state,
    provider: IAM_PLATFORM_STATE_PROVIDER,
    codeVerifier,
    redirectTo,
  });

  const redirectUri = `${url.origin}${IAM_PLATFORM_CALLBACK_PATH}`;
  const authUrl = new URL(`${creds.issuer}/api/oauth/authorize`);
  authUrl.searchParams.set('client_id', creds.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  return Response.redirect(authUrl.toString(), 302);
}

/**
 * @param {Request} request
 * @param {Record<string, unknown>} env
 * @param {import('../adapters/cloudflare-d1/index.js').CloudflareD1Adapter} adapter
 * @param {ReturnType<import('../server/identity-service.js').createIdentityService>} identity
 */
export async function iamPlatformOAuthCallback(request, env, adapter, identity) {
  const creds = resolveIamPlatformCredentials(env);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const err = url.searchParams.get('error');

  if (err || !code || !state) {
    return Response.redirect(`${url.origin}${AUTH_LOGIN_PATH}?error=oauth_failed`, 302);
  }
  if (!creds) {
    return Response.redirect(`${url.origin}${AUTH_LOGIN_PATH}?error=iam_oauth_not_configured`, 302);
  }

  const saved = await adapter.consumeOAuthState(state);
  if (!saved || saved.provider !== IAM_PLATFORM_STATE_PROVIDER) {
    return Response.redirect(`${url.origin}${AUTH_LOGIN_PATH}?error=state_mismatch`, 302);
  }

  const redirectUri = `${url.origin}${IAM_PLATFORM_CALLBACK_PATH}`;
  const token = await exchangeIamPlatformCode({
    issuer: creds.issuer,
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    code,
    codeVerifier: saved.code_verifier,
    redirectUri,
  });
  if (!token?.access_token) {
    return Response.redirect(`${url.origin}${AUTH_LOGIN_PATH}?error=token_exchange_failed`, 302);
  }

  const profile = await fetchIamPlatformUserinfo({
    issuer: creds.issuer,
    accessToken: token.access_token,
  });
  if (!profile?.sub && !profile?.user_id) {
    return Response.redirect(`${url.origin}${AUTH_LOGIN_PATH}?error=userinfo_failed`, 302);
  }

  const subject = String(profile.sub || profile.user_id || '').trim();
  const email = String(profile.email || '').trim().toLowerCase();
  const name = String(profile.name || email.split('@')[0] || 'User').trim();
  if (!subject || !email) {
    return Response.redirect(`${url.origin}${AUTH_LOGIN_PATH}?error=userinfo_incomplete`, 302);
  }

  const result = await identity.provisionOAuthUser({
    provider: 'iam',
    providerSubject: subject,
    email,
    displayName: name,
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
