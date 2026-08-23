export const IAM_IDENTITY_AUTHORIZE_PATH = '/api/oauth/identity/authorize';
export const IAM_IDENTITY_TOKEN_PATH = '/api/oauth/identity/token';
export const IAM_IDENTITY_USERINFO_PATH = '/api/oauth/identity/userinfo';
export const IAM_DEFAULT_OIDC_SCOPE = 'openid profile email';

function normalizeIssuer(issuer) {
  return String(issuer || '').replace(/\/+$/, '');
}

/**
 * @param {import('../../provider-contract.js').OAuthAuthorizeInput & { issuer: string }} input
 */
export function getIamAuthUrl({
  issuer,
  clientId,
  redirectUri,
  state,
  codeChallenge,
  scope,
} = {}) {
  const base = normalizeIssuer(issuer);
  const url = new URL(`${base}${IAM_IDENTITY_AUTHORIZE_PATH}`);
  url.searchParams.set('client_id', clientId || '');
  url.searchParams.set('redirect_uri', redirectUri || '');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scope || IAM_DEFAULT_OIDC_SCOPE);
  url.searchParams.set('state', state || '');
  if (codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}

/**
 * @param {import('../../provider-contract.js').OAuthExchangeInput & { issuer: string }} input
 */
export async function exchangeIamCode({
  issuer,
  code,
  codeVerifier,
  clientId,
  clientSecret,
  redirectUri,
}) {
  try {
    const base = normalizeIssuer(issuer);
    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('code', code || '');
    body.set('code_verifier', codeVerifier || '');
    body.set('client_id', clientId || '');
    if (clientSecret) body.set('client_secret', clientSecret);
    body.set('redirect_uri', redirectUri || '');

    const res = await fetch(`${base}${IAM_IDENTITY_TOKEN_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.ok) return null;
    return json;
  } catch {
    return null;
  }
}
