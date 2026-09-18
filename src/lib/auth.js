/**
 * RFC 8252 native-app OAuth for AgentSam CLI.
 *
 * The CLI is a public client: authorization code + PKCE over a loopback
 * redirect. Browser OAuth sessions are machine-local and remain separate from
 * reusable AGENTSAM_API_KEY (aak_*) credentials.
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

export const AGENTSAM_NATIVE_OAUTH_CLIENT_ID = 'iam_cli_agentsam';
export const AGENTSAM_NATIVE_OAUTH_SCOPE = 'openid profile email offline_access';
export const AGENTSAM_OAUTH_CALLBACK_PATH = '/oauth/callback';

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

export function createPkcePair(options = {}) {
  const verifier = randomUrlSafe(32, options.randomBytesImpl || randomBytes);
  const challenge = base64url(createHash('sha256').update(verifier, 'ascii').digest());
  return Object.freeze({ verifier, challenge, method: 'S256' });
}

export function buildNativeAuthorizationUrl(options = {}) {
  const env = options.env || process.env;
  const issuer = resolveIamIssuer(env, options.issuer || '');
  const clientId = clean(options.clientId) || AGENTSAM_NATIVE_OAUTH_CLIENT_ID;
  const redirectUri = clean(options.redirectUri);
  const state = clean(options.state);
  const codeChallenge = clean(options.codeChallenge);
  const scope = clean(options.scope ?? AGENTSAM_NATIVE_OAUTH_SCOPE);
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
  return oauthTokenRequest({
    grant_type: 'authorization_code',
    client_id: clean(options.clientId) || AGENTSAM_NATIVE_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier,
  }, options);
}

export async function refreshAccountSession(options = {}) {
  const session = options.session || readAccountSession(options);
  if (!session?.refresh_token) throw new Error('browser_oauth_refresh_unavailable');
  const clientId = clean(session.client_id) || clean(options.clientId) || AGENTSAM_NATIVE_OAUTH_CLIENT_ID;
  const refreshed = await oauthTokenRequest({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: session.refresh_token,
  }, options);

  return saveAccountSession({
    ...refreshed,
    refresh_token: clean(refreshed.refresh_token) || session.refresh_token,
    client_id: clientId,
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
  if (apiKey.value || apiKey.error) return apiKey;

  let session = readAccountSession(options);
  if (!session?.access_token) return { value: '', source: null, kind: null, session: null };

  if (isBrowserSessionExpired(session, options)) {
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
  const clientId = clean(options.clientId) || AGENTSAM_NATIVE_OAUTH_CLIENT_ID;
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

    const promptImpl = options.promptToOpenUrlImpl || promptToOpenUrl;
    await promptImpl(authorizationUrl, {
      heading: 'Authenticate your InnerAnimalMedia account at:',
      prompt: 'Press ENTER to open InnerAnimalMedia sign-in in your browser.',
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
