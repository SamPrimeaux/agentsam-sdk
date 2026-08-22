/**
 * OAuth credential lanes for customer apps.
 *
 * Default (IAM platform): IAM_CLIENT_ID + IAM_CLIENT_SECRET — Wrangler **secrets** only.
 * BYOK (optional): GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET or GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET.
 *
 * Encryption is law, not luxury — never put *_CLIENT_SECRET in wrangler.toml plaintext vars.
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
export function usesIamPlatformOAuth(env) {
  return resolveIamPlatformCredentials(env) != null;
}

/**
 * @param {Record<string, unknown> | null | undefined} env
 * @param {'google' | 'github'} provider
 * @returns {{
 *   lane: 'iam_platform' | 'byok_google' | 'byok_github',
 *   clientId: string,
 *   clientSecret: string,
 *   issuer?: string,
 *   provider: string,
 * } | null}
 */
export function resolveOAuthCredentialLane(env, provider) {
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

  if (provider === 'google') {
    const clientId = String(env?.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = String(env?.GOOGLE_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) return null;
    return { lane: 'byok_google', clientId, clientSecret, provider };
  }

  if (provider === 'github') {
    const clientId = String(env?.GITHUB_CLIENT_ID || '').trim();
    const clientSecret = String(env?.GITHUB_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) return null;
    return { lane: 'byok_github', clientId, clientSecret, provider };
  }

  return null;
}
