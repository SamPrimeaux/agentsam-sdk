import { resolveIamOrigin } from '../contracts/auth-config.js';

/**
 * OAuth credential lanes for customer apps.
 *
 * Required: IAM_CLIENT_ID + IAM_CLIENT_SECRET + IAM_OAUTH_ISSUER
 *   — ID may be a plaintext Wrangler var (public by OAuth design).
 *   — SECRET is wrangler secret put only (encryption is law, not luxury).
 *   — ISSUER has no DEFAULT_* — unset means not configured.
 *
 * Developer BYOK:
 *   GOOGLE_CLIENT_* / GITHUB_CLIENT_* — browser OAuth start buttons
 *   GOOGLE_DESKTOP_CLIENT_ID — CLI/desktop PKCE (+ optional DESKTOP secret)
 *   CLOUDFLARE_OAUTH_CLIENT_ID — Cloudflare sign-in (secret optional for PKCE)
 * When unset, Google/GitHub buttons fall back to the IAM platform lane.
 */

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
  let origin;
  try {
    origin = resolveIamOrigin(env);
  } catch {
    return null;
  }
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
 * @param {'google' | 'google_desktop' | 'github' | 'cloudflare' | 'inneranimalmedia' | 'iam'} provider
 * @returns {{
 *   lane: 'iam_platform' | 'byok_google' | 'byok_google_desktop' | 'byok_github' | 'byok_cloudflare',
 *   clientId: string,
 *   clientSecret: string,
 *   origin?: string,
 *   issuer?: string,
 *   provider: string,
 * } | null}
 */
export function resolveOAuthCredentialLane(env, provider) {
  const key = String(provider || '').trim().toLowerCase().replace(/-/g, '_');

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

  if (key === 'google_desktop') {
    const clientId = String(env?.GOOGLE_DESKTOP_CLIENT_ID || '').trim();
    if (clientId) {
      return {
        lane: 'byok_google_desktop',
        clientId,
        clientSecret: '',
        provider: 'google_desktop',
      };
    }
    return null;
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
    // connector (packages/connectors/cfoa). clientSecret may be empty
    // if that client is configured as PKCE-only (Token Authentication
    // Method = None) — exchangeCloudflareCode() omits it in that case.
    const clientId = String(env?.CLOUDFLARE_OAUTH_CLIENT_ID || '').trim();
    const clientSecret = String(env?.CLOUDFLARE_OAUTH_CLIENT_SECRET || '').trim();
    if (clientId) {
      return { lane: 'byok_cloudflare', clientId, clientSecret, provider: 'cloudflare' };
    }
    return null;
  }

  if (key === 'chatgpt' || key === 'openai' || key === 'chatgpt_hosted') {
    // Hosted Apps SDK identity — no OAuth client secret. Selection is always
    // available; runtime proof comes from oai-authenticated-* request headers.
    return {
      lane: 'hosted_chatgpt',
      clientId: String(env?.CHATGPT_APP_ID || env?.OPENAI_APP_ID || 'chatgpt-hosted').trim(),
      clientSecret: '',
      provider: 'chatgpt',
    };
  }

  // Provider selection is fail-closed. A Google or GitHub button must never
  // silently become InnerAnimalMedia/IAM. IAM remains an explicit provider.
  return null;
}
