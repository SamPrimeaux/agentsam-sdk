/**
 * OAuth credentials for customer apps — IAM platform only.
 *
 * Required (Wrangler secrets, minted at install/build):
 *   IAM_CLIENT_ID + IAM_CLIENT_SECRET
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
export function requireIamPlatformCredentials(env) {
  const creds = resolveIamPlatformCredentials(env);
  if (!creds) {
    const err = new Error('iam_oauth_not_configured');
    err.code = 'iam_oauth_not_configured';
    throw err;
  }
  return creds;
}
