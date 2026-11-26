const CLOUDFLARE_AUTH_URL = 'https://dash.cloudflare.com/oauth2/auth';
const CLOUDFLARE_TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token';

// Identity-only login: account identity + user details (email/name via /v4/user).
// Do NOT request the resource-access scope set used by the Cloudflare *connection* flow.
const CLOUDFLARE_LOGIN_SCOPE = 'account-settings.read user-details.read offline_access';

/** @param {import('../../provider-contract.js').OAuthAuthorizeInput} input */
export function getCloudflareAuthUrl({ clientId, redirectUri, state, codeChallenge, scope } = {}) {
  const url = new URL(CLOUDFLARE_AUTH_URL);
  url.searchParams.set('client_id', clientId || '');
  url.searchParams.set('redirect_uri', redirectUri || '');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scope || CLOUDFLARE_LOGIN_SCOPE);
  url.searchParams.set('state', state || '');
  if (codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}

/** @param {import('../../provider-contract.js').OAuthExchangeInput} input */
export async function exchangeCloudflareCode({ code, codeVerifier, clientId, clientSecret, redirectUri }) {
  try {
    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('code', code || '');
    body.set('code_verifier', codeVerifier || '');
    body.set('client_id', clientId || '');
    // client_secret is only sent when configured — the client may be a
    // PKCE-only public client (Token Authentication Method = None), same
    // pattern as the Local Studio resource connector.
    if (clientSecret) body.set('client_secret', clientSecret);
    body.set('redirect_uri', redirectUri || '');

    const res = await fetch(CLOUDFLARE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
