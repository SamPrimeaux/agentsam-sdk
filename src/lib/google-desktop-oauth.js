/**
 * Native Desktop Google OAuth (PKCE + loopback) for Agent Sam CLI.
 * Uses GOOGLE_DESKTOP_CLIENT_ID — never embeds a desktop client secret as a security boundary.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  createLoopbackCallbackListener,
  createPkcePair,
} from './auth.js';
import { promptToOpenUrl, openExternalUrl } from './open-url.js';
import { setSecureProviderKey } from '../security/local-vault.js';
import { writeGoogleCloudConnection } from './google-cloud-connection.js';

/** Identity + Cloud Platform — what `agentsam gcloud auth login` requests by default. */
export const GOOGLE_CLOUD_CONNECTION_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/cloud-platform',
].join(' ');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function randomState(randomBytesImpl = randomBytes) {
  return base64url(randomBytesImpl(24));
}

/** Public Desktop client id — env first, then stock Studio public-config (not load-agent-env). */
export function resolveGoogleDesktopClientId(env = process.env) {
  const id = clean(env.GOOGLE_DESKTOP_CLIENT_ID);
  if (!id) {
    const err = new Error(
      'GOOGLE_DESKTOP_CLIENT_ID is not configured. Stock path: fetch from Local Studio GET /api/public-config (Worker vars). Do not rely on another user\'s ~/.agentsam/load-agent-env.sh. Tip: agentsam gcloud auth login --permissions',
    );
    err.code = 'google_desktop_client_not_configured';
    throw err;
  }
  return id;
}

/**
 * Resolve desktop client id: env override, then Studio/public host public-config.
 * @param {object} [env]
 * @param {{ fetchImpl?: typeof fetch, publicConfigUrl?: string }} [opts]
 */
export async function resolveGoogleDesktopClientIdAsync(env = process.env, opts = {}) {
  const fromEnv = clean(env.GOOGLE_DESKTOP_CLIENT_ID);
  if (fromEnv) return fromEnv;

  const fetchImpl = opts.fetchImpl || fetch;
  const candidates = [];
  if (clean(opts.publicConfigUrl)) candidates.push(clean(opts.publicConfigUrl));
  const studioOrigin = clean(env.AGENTSAM_STUDIO_ORIGIN) || 'https://agentsam.inneranimalmedia.com';
  candidates.push(new URL('/api/public-config', `${studioOrigin}/`).toString());

  for (const url of candidates) {
    try {
      const res = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(8000) : undefined,
      });
      if (!res.ok) continue;
      const body = await res.json().catch(() => null);
      const id = clean(body?.google_desktop_client_id);
      if (id) return id;
    } catch {
      /* try next */
    }
  }

  return resolveGoogleDesktopClientId(env);
}

export function buildGoogleDesktopAuthUrl({
  clientId,
  redirectUri,
  state,
  codeChallenge,
  scope = GOOGLE_CLOUD_CONNECTION_SCOPES,
} = {}) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', clientId || '');
  url.searchParams.set('redirect_uri', redirectUri || '');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scope || GOOGLE_CLOUD_CONNECTION_SCOPES);
  url.searchParams.set('state', state || '');
  url.searchParams.set('code_challenge', codeChallenge || '');
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  return url.toString();
}

export async function exchangeGoogleDesktopCode({
  code,
  codeVerifier,
  clientId,
  redirectUri,
  fetchImpl = fetch,
  timeoutMs = 20_000,
  studioOrigin = '',
  allowStudioBroker = true,
} = {}) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code || '',
    code_verifier: codeVerifier || '',
    client_id: clientId || '',
    redirect_uri: redirectUri || '',
  });
  // Desktop public clients: secret is optional / not a confidentiality boundary.
  const signal = typeof AbortSignal?.timeout === 'function'
    ? AbortSignal.timeout(Math.max(1, Number(timeoutMs) || 20_000))
    : undefined;
  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.access_token) return data;

  const detail = data.error_description || data.error || `token_http_${res.status}`;
  const needsSecret = /client_secret/i.test(String(detail));

  // Stock mitigation: never put a Google client secret in the CLI. If this client_id
  // was created as a Web app in Google Console, ask Local Studio to exchange using
  // Worker-held secrets (GOOGLE_DESKTOP_CLIENT_SECRET or matching web secret).
  if (needsSecret && allowStudioBroker) {
    const origin = clean(studioOrigin)
      || clean(process.env.AGENTSAM_STUDIO_ORIGIN)
      || 'https://agentsam.inneranimalmedia.com';
    try {
      const brokerRes = await fetchImpl(new URL('/api/oauth/google/desktop-exchange', `${origin}/`).toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
          client_id: clientId,
        }),
        signal,
      });
      const broker = await brokerRes.json().catch(() => ({}));
      if (brokerRes.ok && broker.access_token) {
        return {
          access_token: broker.access_token,
          refresh_token: broker.refresh_token || null,
          token_type: broker.token_type || 'Bearer',
          expires_in: broker.expires_in || null,
          scope: broker.scope || null,
          exchange_via: 'studio_broker',
        };
      }
      const brokerDetail = broker.detail || broker.error || `broker_http_${brokerRes.status}`;
      const err = new Error(
        `google_token_exchange_failed: ${brokerDetail}. `
        + 'Desktop clients must be type "Desktop app" in Google Console (no secret). '
        + 'Or set Worker secret GOOGLE_DESKTOP_CLIENT_SECRET for a Web-typed client id. '
        + 'Web app login uses GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET on the Worker only.',
      );
      err.code = 'google_token_exchange_failed';
      err.remediation = broker.remediation || null;
      throw err;
    } catch (brokerErr) {
      if (brokerErr?.code === 'google_token_exchange_failed') throw brokerErr;
      // fall through to original error
    }
  }

  const err = new Error(
    needsSecret
      ? `google_token_exchange_failed: ${detail}. `
        + 'This client_id is confidential (Web) in Google Console. '
        + 'Create an OAuth client type Desktop app and set GOOGLE_DESKTOP_CLIENT_ID, '
        + 'or put that Web client\'s secret on the Worker as GOOGLE_DESKTOP_CLIENT_SECRET.'
      : `google_token_exchange_failed: ${detail}`,
  );
  err.code = 'google_token_exchange_failed';
  throw err;
}

export async function fetchGoogleUserInfo(accessToken, fetchImpl = fetch, timeoutMs = 15_000) {
  const signal = typeof AbortSignal?.timeout === 'function'
    ? AbortSignal.timeout(Math.max(1, Number(timeoutMs) || 15_000))
    : undefined;
  const res = await fetchImpl(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

/**
 * Full Desktop Google Cloud connection login.
 * Opens system browser → loopback callback settles automatically (no second Enter).
 */
export async function runGoogleDesktopCloudLogin(options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const env = options.env || process.env;
  const clientId = await resolveGoogleDesktopClientIdAsync(env, {
    fetchImpl: options.fetchImpl,
    publicConfigUrl: options.publicConfigUrl,
  });
  const scope = clean(options.scope) || GOOGLE_CLOUD_CONNECTION_SCOPES;
  const state = randomState(options.randomBytesImpl);
  const pkce = createPkcePair({ randomBytesImpl: options.randomBytesImpl });

  const listener = await createLoopbackCallbackListener({
    state,
    host: options.host || '127.0.0.1',
    port: options.port,
    callbackPath: options.callbackPath || '/callback',
    timeoutMs: options.timeoutMs || 300_000,
    createServerImpl: options.createServerImpl,
  });

  try {
    const authUrl = buildGoogleDesktopAuthUrl({
      clientId,
      redirectUri: listener.redirectUri,
      state,
      codeChallenge: pkce.challenge,
      scope,
    });

    write('\n  Agent Sam · Google Cloud connection\n');
    write('  ────────────────────────────────────────────────────────\n');
    write('  Desktop OAuth + PKCE (loopback). Browser will return here automatically.\n');
    write(`  Client     ${clientId.slice(0, 28)}…\n`);
    write(`  Redirect   ${listener.redirectUri}\n`);
    write('  Scopes\n');
    for (const s of scope.split(/\s+/).filter(Boolean)) {
      write(`    • ${s}\n`);
    }
    write('\n');

    if (options.json) {
      write(JSON.stringify({
        schema_version: 'agentsam-google-desktop-oauth-v1',
        mode: 'desktop_pkce',
        client_id: clientId,
        redirect_uri: listener.redirectUri,
        authorization_url: authUrl,
        scopes: scope.split(/\s+/).filter(Boolean),
      }, null, 2) + '\n');
    }

    if (!options.noLaunchBrowser) {
      const promptImpl = options.promptToOpenUrlImpl || promptToOpenUrl;
      await promptImpl(authUrl, {
        heading: '  Continue to Agent Sam (Google Cloud) at:',
        prompt: 'Press ENTER to open Google in your browser. When you finish, this terminal continues automatically.',
        input: options.input,
        output: options.output,
        openImpl: options.openImpl || openExternalUrl,
      });
    } else {
      write(`  Open this URL manually:\n  ${authUrl}\n\n`);
      write('  Waiting for loopback callback…\n');
    }

    write('  Waiting for Google callback on loopback…\n');
    const callback = await listener.waitForCallback();
    write('  ✓ Loopback callback received\n');
    // Release the port before network/keychain work so the browser tab can close cleanly.
    try { await listener.close(); } catch { /* ignore */ }
    write('  Exchanging authorization code with Google…\n');
    const token = await exchangeGoogleDesktopCode({
      code: callback.code,
      codeVerifier: pkce.verifier,
      clientId,
      redirectUri: listener.redirectUri,
      fetchImpl: options.fetchImpl,
    });

    write('  Fetching Google account profile…\n');
    const profile = await fetchGoogleUserInfo(token.access_token, options.fetchImpl);
    const email = clean(profile?.email) || null;
    const expiresAt = token.expires_in
      ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
      : null;

    const credentialPayload = JSON.stringify({
      schema_version: 'agentsam-google-oauth-token-v1',
      access_token: token.access_token,
      refresh_token: token.refresh_token || null,
      token_type: token.token_type || 'Bearer',
      scope: token.scope || scope,
      expires_at: expiresAt,
      email,
      client_id: clientId,
    });

    if (options.storeCredential !== false) {
      write('  Storing credential (keychain / local vault)…\n');
      setSecureProviderKey('google-cloud', {
        value: credentialPayload,
        accountId: email,
      }, { home: options.home, env, disableOsStore: options.disableOsStore });
    }

    if (email && options.writeConnection !== false) {
      writeGoogleCloudConnection(
        { identity: email },
        { home: options.home, env },
      );
    }

    write('\n  ✓ Google Cloud connection authorized\n');
    if (email) write(`  Identity   ${email}\n`);
    write('  Stored     OS keychain / local vault (google-cloud)\n');
    write('  Next\n');
    write('    agentsam google-cloud connection set --project PROJECT_ID\n');
    write('    agentsam google-cloud doctor\n');
    write('\n');

    return {
      ok: true,
      email,
      scopes: (token.scope || scope).split(/\s+/).filter(Boolean),
      expires_at: expiresAt,
      has_refresh_token: Boolean(token.refresh_token),
    };
  } finally {
    try { await listener.close(); } catch { /* already closed */ }
  }
}

/**
 * Console / IAM checklist for Google Cloud + MCP (not OAuth scopes).
 */
export function googleCloudPermissionChecklist() {
  return {
    oauth_scopes_requested: GOOGLE_CLOUD_CONNECTION_SCOPES.split(/\s+/),
    oauth_consent_screen: [
      'Google Auth Platform → Data Access: add cloud-platform (and openid/email/profile)',
      'Branding → App name: AgentSam Local Studio (name shows only after brand verification)',
      'Until verified, Google shows the authorized domain (often inneranimalmedia.com)',
      'Audience: Testing → add your Google accounts as test users',
    ],
    project_iam_roles: [
      'roles/viewer or stronger for read discovery',
      'roles/editor or roles/owner for provision/mutate',
      'roles/mcp.toolUser for Google/Google Cloud remote MCP (mcp.tools.call)',
      'Plus product roles (e.g. run.developer, bigquery.jobUser) for specific MCP servers',
    ],
    notes: [
      'OAuth scopes authorize the app to call APIs as you.',
      'IAM roles on the GCP project authorize what that principal can actually do.',
      'Both are required for Cloud operations.',
    ],
  };
}
