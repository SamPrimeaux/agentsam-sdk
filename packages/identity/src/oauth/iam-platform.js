import { AUTH_LOGIN_PATH } from '../core/constants.js';
import {
  IAM_PLATFORM_CALLBACK_PATH,
  IAM_PLATFORM_STATE_PROVIDER,
  resolveIamPlatformCredentials,
} from './credentials.js';
import { pkceChallenge, pkceVerifier, randomOAuthState } from './pkce.js';
import {
  exchangeIamCode,
  getIamAuthUrl,
  IAM_DEFAULT_OIDC_SCOPE,
} from '../providers/iam/oauth.js';
import { fetchIamProfile } from '../providers/iam/profile.js';
import { normalizeIamIdentity } from '../providers/iam/mapper.js';

/**
 * Redirect browser to IAM /api/oauth/identity/authorize (PKCE).
 * @param {Request} request
 * @param {Record<string, unknown>} env
 * @param {import('../adapters/cloudflare-d1/index.js').CloudflareD1Adapter} adapter
 */
export async function iamPlatformOAuthStart(request, env, adapter) {
  const creds = resolveIamPlatformCredentials(env);
  if (!creds) {
    return Response.json({ ok: false, error: 'iam_oauth_not_configured' }, 503);
  }

  const url = new URL(request.url);
  const state = randomOAuthState();
  const codeVerifier = pkceVerifier();
  const codeChallenge = await pkceChallenge(codeVerifier);
  const redirectTo = url.searchParams.get('next')
    || url.searchParams.get('return_to')
    || '/dashboard/cms';

  await adapter.saveOAuthState({
    state,
    provider: IAM_PLATFORM_STATE_PROVIDER,
    codeVerifier,
    redirectTo,
  });

  const redirectUri = `${url.origin}${IAM_PLATFORM_CALLBACK_PATH}`;
  const authUrl = getIamAuthUrl({
    issuer: creds.issuer,
    clientId: creds.clientId,
    redirectUri,
    state,
    codeChallenge,
    scope: IAM_DEFAULT_OIDC_SCOPE,
  });

  return Response.redirect(authUrl, 302);
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
  const token = await exchangeIamCode({
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

  const profile = await fetchIamProfile({
    issuer: creds.issuer,
    accessToken: token.access_token,
  });
  const normalized = profile ? normalizeIamIdentity(profile) : null;
  if (!normalized?.subject || !normalized?.email) {
    return Response.redirect(`${url.origin}${AUTH_LOGIN_PATH}?error=userinfo_failed`, 302);
  }

  const result = await identity.provisionOAuthUser({
    provider: 'iam',
    providerSubject: normalized.subject,
    email: normalized.email,
    displayName: normalized.name || normalized.email.split('@')[0] || 'User',
  });

  const redirectTo = saved.redirect_to || '/dashboard/cms';
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

// Re-export provider primitives for callers that import iam-platform directly.
export { exchangeIamCode, fetchIamProfile, getIamAuthUrl };
