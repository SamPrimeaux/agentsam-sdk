/**
 * RFC 8252 native-app OAuth for AgentSam CLI.
 *
 * IAM credentials resolve from env only:
 *   IAM_CLIENT_ID / IAM_CLIENT_SECRET / IAM_OAUTH_ISSUER
 * No parallel "native" client_id constant — unset IAM_CLIENT_ID → not_configured.
 */
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { resolveIamIssuer } from '../../packages/identity/src/contracts/auth-config.js';
import { promptToOpenUrl } from './open-url.js';
import {
  isBrowserSessionExpired,
  readAccountSession,
  resolveAccountApiKey,
  saveAccountSession,
} from './account-session.js';

export const AGENTSAM_OAUTH_SCOPE = 'openid profile email offline_access';
export const AGENTSAM_OAUTH_CALLBACK_PATH = '/callback';

function clean(value) { return value == null ? '' : String(value).trim(); }
function base64url(value) {
  return Buffer.from(value).toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
function randomUrlSafe(bytes = 32, randomBytesImpl = randomBytes) {
  return base64url(randomBytesImpl(bytes));
}
function oauthErrorMessage(body, status) {
  const code = clean(body?.error);
  const description = clean(body?.error_description || body?.message);
  if (code && description) return `${code}: ${description}`;
  return code || description || `OAuth token HTTP ${status}`;
}

/**
 * Resolve IAM OAuth client_id. No hardcoded fallback.
 * @returns {{ clientId: string } | { error: string }}
 */
export function resolveIamClientId(options = {}) {
  const env = options.env || process.env;
  const clientId = clean(options.clientId) || clean(env.IAM_CLIENT_ID);
  if (!clientId) {
    return { error: 'iam_oauth_not_configured', clientId: '' };
  }
  return { clientId, error: null };
}

export function createPkcePair(options = {}) {
  const verifier = randomUrlSafe(32, options.randomBytesImpl || randomBytes);
  const challenge = base64url(createHash('sha256').update(verifier, 'ascii').digest());
  return Object.freeze({ verifier, challenge, method: 'S256' });
}

export function buildNativeAuthorizationUrl(options = {}) {
  const env = options.env || process.env;
  const issuer = resolveIamIssuer(env, options.issuer || '');
  const resolved = resolveIamClientId(options);
  if (resolved.error) {
    const err = new Error(resolved.error);
    err.code = resolved.error;
    throw err;
  }
  const clientId = resolved.clientId;
  const redirectUri = clean(options.redirectUri);
  const state = clean(options.state);
  const codeChallenge = clean(options.codeChallenge);
  const scope = clean(options.scope ?? AGENTSAM_OAUTH_SCOPE);
  if (!redirectUri || !state || !codeChallenge) throw new Error('oauth_authorization_parameters_required');

  const url = new URL('/api/oauth/authorize', `${issuer}/`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  if (scope) url.searchParams.set('scope', scope);
  return url.toString();
}

async function oauthTokenRequest(params, options = {}) {
  const env = options.env || process.env;
  const issuer = resolveIamIssuer(env, options.issuer || '');
  const fetchImpl = options.fetchImpl || fetch;
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    const normalized = clean(value);
    if (normalized) body.set(key, normalized);
  }

  const response = await fetchImpl(new URL('/api/oauth/token', `${issuer}/`).toString(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    signal: options.signal || (typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(15_000) : undefined),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(oauthErrorMessage(data, response.status));
    error.status = response.status;
    error.oauth_error = clean(data?.error) || null;
    throw error;
  }
  if (!clean(data?.access_token)) throw new Error('oauth_token_response_missing_access_token');
  return data;
}

export async function exchangeAuthorizationCode(options = {}) {
  const code = clean(options.code);
  const codeVerifier = clean(options.codeVerifier);
  const redirectUri = clean(options.redirectUri);
  if (!code || !codeVerifier || !redirectUri) throw new Error('oauth_authorization_code_exchange_parameters_required');
  const resolved = resolveIamClientId(options);
  if (resolved.error) {
    const err = new Error(resolved.error);
    err.code = resolved.error;
    throw err;
  }
  return oauthTokenRequest({
    grant_type: 'authorization_code',
    client_id: resolved.clientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier,
  }, options);
}

export async function refreshAccountSession(options = {}) {
  const session = options.session || readAccountSession(options);
  if (!session?.refresh_token) throw new Error('browser_oauth_refresh_unavailable');
  const resolved = resolveIamClientId({
    ...options,
    clientId: clean(session.client_id) || clean(options.clientId),
  });
  if (resolved.error) {
    const err = new Error(resolved.error);
    err.code = resolved.error;
    throw err;
  }
  const refreshed = await oauthTokenRequest({
    grant_type: 'refresh_token',
    client_id: resolved.clientId,
    refresh_token: session.refresh_token,
  }, options);

  return saveAccountSession({
    ...refreshed,
    refresh_token: clean(refreshed.refresh_token) || session.refresh_token,
    client_id: resolved.clientId,
    user_id: session.user_id,
    account_id: session.account_id,
    email: session.email,
  }, {
    ...options,
    preserveRefreshToken: true,
  });
}

/**
 * Canonical SDK account authority resolution.
 * explicit aak_* -> AGENTSAM_API_KEY -> stored browser OAuth -> OAuth refresh.
 */
export async function resolveAccountAuthority(options = {}) {
  const apiKey = resolveAccountApiKey(options);
  if (apiKey.value) return apiKey;
  if (clean(options.explicit) && apiKey.error) return apiKey;

  let session = readAccountSession(options);
  if (!session?.access_token) {
    return apiKey.error ? apiKey : { value: '', source: null, kind: null, session: null };
  }

  if (options.forceRefresh === true || isBrowserSessionExpired(session, options)) {
    if (!session.refresh_token) {
      return {
        value: '',
        source: 'agentsam_browser_oauth',
        kind: 'browser_oauth',
        session,
        error: 'browser_oauth_session_expired',
      };
    }
    try {
      const refreshImpl = options.refreshImpl || refreshAccountSession;
      session = await refreshImpl({ ...options, session });
    } catch (error) {
      return {
        value: '',
        source: 'agentsam_browser_oauth',
        kind: 'browser_oauth',
        session,
        error: `browser_oauth_refresh_failed: ${error?.message || String(error)}`,
      };
    }
  }

  return {
    value: session.access_token,
    source: 'agentsam_browser_oauth',
    kind: 'browser_oauth',
    session,
    fallback_error: apiKey.error || null,
  };
}

export async function createLoopbackCallbackListener(options = {}) {
  const host = clean(options.host) || '127.0.0.1';
  const callbackPath = clean(options.callbackPath) || AGENTSAM_OAUTH_CALLBACK_PATH;
  const expectedState = clean(options.state);
  if (!expectedState) throw new Error('oauth_state_required');
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 180_000;
  const createServerImpl = options.createServerImpl || http.createServer;

  let settle;
  let settled = false;
  let timer = null;
  const callbackPromise = new Promise((resolve, reject) => {
    settle = (error, result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
  });

  const server = createServerImpl((req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', `http://${host}`);
      if (requestUrl.pathname !== callbackPath) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      const returnedState = clean(requestUrl.searchParams.get('state'));
      const oauthError = clean(requestUrl.searchParams.get('error'));
      const oauthDescription = clean(requestUrl.searchParams.get('error_description'));
      const code = clean(requestUrl.searchParams.get('code'));

      if (!returnedState || returnedState !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Invalid OAuth state. Return to the terminal and retry.');
        settle(new Error('oauth_state_mismatch'));
        return;
      }
      if (oauthError) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Authorization was not completed. Return to the terminal.');
        settle(new Error(oauthDescription ? `${oauthError}: ${oauthDescription}` : oauthError));
        return;
      }
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Authorization code missing. Return to the terminal and retry.');
        settle(new Error('oauth_authorization_code_missing'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><body style="font-family:system-ui"><h1>Agent Sam</h1><p>Authentication complete. You can close this tab and return to your terminal.</p></body></html>');
      settle(null, { code, state: returnedState });
    } catch (error) {
      try {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('OAuth callback failed. Return to the terminal.');
      } catch { /* response may already be closed */ }
      settle(error);
    }
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ host, port: Number(options.port) || 0, exclusive: true });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('oauth_loopback_listener_address_unavailable');
  }
  const redirectUri = `http://${host}:${address.port}${callbackPath}`;
  timer = setTimeout(() => settle(new Error('oauth_callback_timeout')), Math.max(1, timeoutMs));
  timer.unref?.();

  return {
    redirectUri,
    waitForCallback: () => callbackPromise,
    close: () => new Promise((resolve) => {
      if (!server.listening) return resolve();
      server.close(() => resolve());
    }),
  };
}

export async function authenticateViaBrowser(options = {}) {
  const env = options.env || process.env;
  const resolved = resolveIamClientId(options);
  if (resolved.error) {
    const err = new Error(
      'IAM_CLIENT_ID is not configured in this shell (Worker secrets are not visible to the CLI). '
      + 'For agentsam login export IAM_CLIENT_ID=iam_cli_agentsam and IAM_OAUTH_ISSUER=https://inneranimalmedia.com. '
      + 'Local Studio Worker IAM_CLIENT_ID=iam_agentsam_sdk_web is a different OAuth client.',
    );
    err.code = 'iam_oauth_not_configured';
    throw err;
  }
  const clientId = resolved.clientId;
  const loginProvider = clean(options.loginProvider || 'inneranimalmedia').toLowerCase();
  const issuer = resolveIamIssuer(env, options.issuer || '');

  // Google / Cloudflare identity start on the IAM issuer host.
  // Server-side secrets: GOOGLE_CLIENT_ID(+SECRET) or CLOUDFLARE_OAUTH_CLIENT_ID.
  // No AGENTSAM_STUDIO_ORIGIN / hardcoded product host.
  if (loginProvider === 'google' || loginProvider === 'cloudflare') {
    if (loginProvider === 'google') {
      const googleId = clean(env.GOOGLE_CLIENT_ID) || clean(env.GOOGLE_DESKTOP_CLIENT_ID);
      if (!googleId) {
        const err = new Error(
          'GOOGLE_CLIENT_ID (web) or GOOGLE_DESKTOP_CLIENT_ID (desktop) is not configured in this shell.',
        );
        err.code = 'google_oauth_not_configured';
        throw err;
      }
    } else {
      if (!clean(env.CLOUDFLARE_OAUTH_CLIENT_ID)) {
        const err = new Error(
          'CLOUDFLARE_OAUTH_CLIENT_ID is not configured in this shell.',
        );
        err.code = 'cloudflare_oauth_not_configured';
        throw err;
      }
    }
    const startPath = loginProvider === 'google'
      ? '/api/oauth/google/start'
      : '/api/oauth/cloudflare/start';
    const startUrl = new URL(startPath, `${issuer}/`);
    startUrl.searchParams.set('next', '/agentsam');
    const promptImpl = options.promptToOpenUrlImpl || promptToOpenUrl;
    await promptImpl(startUrl.toString(), {
      heading: loginProvider === 'google'
        ? 'Sign in with Google:'
        : 'Sign in with Cloudflare:',
      prompt: 'Press ENTER to open identity sign-in in your browser.',
      input: options.input,
      output: options.output,
      openImpl: options.openImpl,
    });
    if (options.output?.isTTY) {
      options.output.write(
        '\n  After the browser finishes, continuing with IAM CLI OAuth…\n',
      );
    }
  }

  const state = randomUrlSafe(24, options.randomBytesImpl || randomBytes);
  const pkce = createPkcePair({ randomBytesImpl: options.randomBytesImpl });
  const listener = await createLoopbackCallbackListener({
    state,
    host: options.host,
    port: options.port,
    callbackPath: options.callbackPath,
    timeoutMs: options.timeoutMs,
    createServerImpl: options.createServerImpl,
  });

  try {
    const authorizationUrl = buildNativeAuthorizationUrl({
      env,
      issuer: options.issuer,
      clientId,
      redirectUri: listener.redirectUri,
      state,
      codeChallenge: pkce.challenge,
      scope: options.scope,
    });

    // Gate through IAM /auth/login; authorize URL preserved in `next`.
    const authorizePath = authorizationUrl.startsWith(issuer)
      ? authorizationUrl.slice(issuer.length)
      : authorizationUrl.replace(/^https?:\/\/[^/]+/, '');
    const loginGateUrl = new URL('/auth/login', `${issuer}/`);
    loginGateUrl.searchParams.set('next', authorizePath.startsWith('/') ? authorizePath : `/${authorizePath}`);

    const promptImpl = options.promptToOpenUrlImpl || promptToOpenUrl;
    await promptImpl(loginGateUrl.toString(), {
      heading: 'Authenticate your Inner Animal Media account at:',
      prompt: 'Press ENTER to open Inner Animal Media sign-in in your browser.',
      input: options.input,
      output: options.output,
      openImpl: options.openImpl,
    });

    const callback = await listener.waitForCallback();
    const tokenSet = await exchangeAuthorizationCode({
      env,
      issuer: options.issuer,
      clientId,
      redirectUri: listener.redirectUri,
      code: callback.code,
      codeVerifier: pkce.verifier,
      fetchImpl: options.fetchImpl,
      signal: options.signal,
    });

    return saveAccountSession({
      ...tokenSet,
      client_id: clientId,
    }, {
      home: options.home,
      env,
      nowMs: options.nowMs,
      preserveRefreshToken: false,
    });
  } finally {
    await listener.close();
  }
}
