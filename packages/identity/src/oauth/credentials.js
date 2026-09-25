import { DEFAULT_IAM_ORIGIN, resolveIamOrigin } from '../contracts/auth-config.js';

/**
 * OAuth credential lanes for customer apps.
 *
 * Default (minted at install/build): IAM_CLIENT_ID + IAM_CLIENT_SECRET
 *   — ID may be a plaintext Wrangler var (public by OAuth design).
 *   — SECRET is wrangler secret put only (encryption is law, not luxury).
 *
 * Developer BYOK: GOOGLE_CLIENT_* / GITHUB_CLIENT_* when set for that provider
 * take the /api/oauth/{provider}/start button; otherwise the button uses the
 * Inner Animal Media platform lane (`inneranimalmedia`).
 */

/** @deprecated Use DEFAULT_IAM_ORIGIN from the auth configuration contract. */
export const DEFAULT_IAM_OAUTH_ISSUER = DEFAULT_IAM_ORIGIN;
export const IAM_PLATFORM_STATE_PROVIDER = 'iam_platform';
/** Canonical platform OAuth callback (protocol id = inneranimalmedia). */
export const IAM_PLATFORM_CALLBACK_PATH = '/api/oauth/inneranimalmedia/callback';
/** @deprecated Legacy path — still accepted; prefer IAM_PLATFORM_CALLBACK_PATH. */
export const IAM_PLATFORM_CALLBACK_PATH_LEGACY = '/api/oauth/iam/callback';

/**
 * @param {Record<string, unknown> | null | undefined} env
 * @returns {{ clientId: string, clientSecret: string, origin: string, issuer: string } | null}
 */
export function resolveIamPlatformCredentials(env) {
  const clientId = String(env?.IAM_CLIENT_ID || '').trim();
  const clientSecret = String(env?.IAM_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return null;
  const origin = resolveIamOrigin(env);
  // `issuer` remains for one migration window so existing consumers do not break.
  return { clientId, clientSecret, origin, issuer: origin };
}

/** @param {Record<string, unknown> | null | undefined} env */
export function requireIamPlatformCredentials(env) {
  const creds = resolveIamPlatformCredentials(env);
  if (!creds) {
    const err = new Error('iam_oauth_not_configured');
    err.code = 'iam_oauth_not_configured';
    throw err;
  }
  return creds;
}

/**
 * @param {Record<string, unknown> | null | undefined} env
 * @param {'google' | 'github' | 'cloudflare' | 'inneranimalmedia' | 'iam'} provider
 * @returns {{
 *   lane: 'iam_platform' | 'byok_google' | 'byok_github' | 'byok_cloudflare',
 *   clientId: string,
 *   clientSecret: string,
 *   origin?: string,
 *   issuer?: string,
 *   provider: string,
 * } | null}
 */
export function resolveOAuthCredentialLane(env, provider) {
  const key = String(provider || '').trim().toLowerCase();

  // Protocol/selection id is inneranimalmedia; `iam` remains a legacy alias.
  if (key === 'inneranimalmedia' || key === 'iam') {
    const iam = resolveIamPlatformCredentials(env);
    if (!iam) return null;
    return {
      lane: 'iam_platform',
      clientId: iam.clientId,
      clientSecret: iam.clientSecret,
      origin: iam.origin,
      issuer: iam.issuer,
      provider: 'inneranimalmedia',
    };
  }

  if (key === 'google') {
    const clientId = String(env?.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = String(env?.GOOGLE_CLIENT_SECRET || '').trim();
    if (clientId && clientSecret) {
      return { lane: 'byok_google', clientId, clientSecret, provider: 'google' };
    }
  }

  if (key === 'github') {
    const clientId = String(env?.GITHUB_CLIENT_ID || '').trim();
    const clientSecret = String(env?.GITHUB_CLIENT_SECRET || '').trim();
    if (clientId && clientSecret) {
      return { lane: 'byok_github', clientId, clientSecret, provider: 'github' };
    }
  }

  if (key === 'cloudflare') {
    // Reuses the same Worker secrets as the Local Studio Cloudflare resource
    // connector (packages/connectors/cloudflare). clientSecret may be empty
    // if that client is configured as PKCE-only (Token Authentication
    // Method = None) — exchangeCloudflareCode() omits it in that case.
    const clientId = String(env?.CLOUDFLARE_OAUTH_CLIENT_ID || '').trim();
    const clientSecret = String(env?.CLOUDFLARE_OAUTH_CLIENT_SECRET || '').trim();
    if (clientId) {
      return { lane: 'byok_cloudflare', clientId, clientSecret, provider: 'cloudflare' };
    }
    return null;
  }

  // Default: Google/GitHub buttons route through IAM platform when minted.
  const iam = resolveIamPlatformCredentials(env);
  if (iam) {
    return {
      lane: 'iam_platform',
      clientId: iam.clientId,
      clientSecret: iam.clientSecret,
      origin: iam.origin,
      issuer: iam.issuer,
      provider: 'inneranimalmedia',
    };
  }

  return null;
}
