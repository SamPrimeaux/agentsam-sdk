const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/** @param {import('../../provider-contract.js').OAuthAuthorizeInput} input */
export function getGithubAuthUrl({ clientId, redirectUri, state, codeChallenge, scope } = {}) {
  const url = new URL(GITHUB_AUTH_URL);
  url.searchParams.set('client_id', clientId || '');
  url.searchParams.set('redirect_uri', redirectUri || '');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scope || 'read:user user:email');
  url.searchParams.set('state', state || '');
  if (codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}

/** @param {import('../../provider-contract.js').OAuthExchangeInput} input */
export async function exchangeGithubCode({ code, codeVerifier, clientId, clientSecret, redirectUri }) {
  try {
    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('code', code || '');
    body.set('code_verifier', codeVerifier || '');
    body.set('client_id', clientId || '');
    if (clientSecret) body.set('client_secret', clientSecret);
    body.set('redirect_uri', redirectUri || '');

    const res = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
