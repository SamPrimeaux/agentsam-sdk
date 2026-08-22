/**
 * OAuth credential lanes for customer apps.
 *
 * Default (minted at install/build): IAM_CLIENT_ID + IAM_CLIENT_SECRET
 *   — ID may be a plaintext Wrangler var (public by OAuth design).
 *   — SECRET is wrangler secret put only (encryption is law, not luxury).
 *
 * Developer BYOK: GOOGLE_CLIENT_* / GITHUB_CLIENT_* when set for that provider
 * take the /api/oauth/{provider}/start button; otherwise the button uses IAM.
 */

export const DEFAULT_IAM_OAUTH_ISSUER = 'https://inneranimalmedia.com';
export const IAM_PLATFORM_STATE_PROVIDER = 'iam_platform';
export const IAM_PLATFORM_CALLBACK_PATH = '/api/oauth/iam/callback';

/**
 * @param {Record<string, unknown> | null | undefined} env
 * @returns {{ clientId: string, clientSecret: string, issuer: string } | null}
 */
export function resolveIamPlatformCredentials(env) {
  const clientId = String(env?.IAM_CLIENT_ID || '').trim();
  const clientSecret = String(env?.IAM_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return null;
  const issuer = String(env?.IAM_OAUTH_ISSUER || DEFAULT_IAM_OAUTH_ISSUER).replace(/\/+$/, '');
  return { clientId, clientSecret, issuer };
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
 * @param {'google' | 'github' | 'iam'} provider
 * @returns {{
 *   lane: 'iam_platform' | 'byok_google' | 'byok_github',
 *   clientId: string,
 *   clientSecret: string,
 *   issuer?: string,
 *   provider: string,
 * } | null}
 */
export function resolveOAuthCredentialLane(env, provider) {
  if (provider === 'iam') {
    const iam = resolveIamPlatformCredentials(env);
    if (!iam) return null;
    return {
      lane: 'iam_platform',
      clientId: iam.clientId,
      clientSecret: iam.clientSecret,
      issuer: iam.issuer,
      provider: 'iam',
    };
  }

  if (provider === 'google') {
    const clientId = String(env?.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = String(env?.GOOGLE_CLIENT_SECRET || '').trim();
    if (clientId && clientSecret) {
      return { lane: 'byok_google', clientId, clientSecret, provider };
    }
  }

  if (provider === 'github') {
    const clientId = String(env?.GITHUB_CLIENT_ID || '').trim();
    const clientSecret = String(env?.GITHUB_CLIENT_SECRET || '').trim();
    if (clientId && clientSecret) {
      return { lane: 'byok_github', clientId, clientSecret, provider };
    }
  }

  // Default: Google/GitHub buttons route through IAM platform when minted.
  const iam = resolveIamPlatformCredentials(env);
  if (iam) {
    return {
      lane: 'iam_platform',
      clientId: iam.clientId,
      clientSecret: iam.clientSecret,
      issuer: iam.issuer,
      provider,
    };
  }

  return null;
}
