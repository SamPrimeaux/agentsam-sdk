/**
 * Stock CLI Google Cloud login via Local Studio Web client (secret stays on Worker).
 * Browser: Studio /api/oauth/google/cli-cloud/* → loopback pickup → CLI stores tokens.
 */
import { randomBytes } from 'node:crypto';
import {
  createLoopbackCallbackListener,
} from './auth.js';
import { promptToOpenUrl, openExternalUrl } from './open-url.js';
import { setSecureProviderKey } from '../security/local-vault.js';
import { writeGoogleCloudConnection } from './google-cloud-connection.js';
import { GOOGLE_CLOUD_CONNECTION_SCOPES } from './google-desktop-oauth.js';

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

/**
 * Stock CLI Google Cloud login via Local Studio Web client (secret stays on Worker).
 * Browser: Studio /api/oauth/google/cli-cloud/* → loopback pickup → CLI stores tokens.
 */
export async function runGoogleStudioBrokeredCloudLogin(options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const studioOrigin = clean(options.studioOrigin)
    || clean(env.AGENTSAM_STUDIO_ORIGIN)
    || 'https://agentsam.inneranimalmedia.com';
  const state = randomState(options.randomBytesImpl);

  const listener = await createLoopbackCallbackListener({
    state,
    host: options.host || '127.0.0.1',
    port: options.port,
    callbackPath: options.callbackPath || '/callback',
    timeoutMs: options.timeoutMs || 300_000,
    createServerImpl: options.createServerImpl,
  });

  try {
    const startUrl = new URL('/api/oauth/google/cli-cloud/start', `${studioOrigin}/`);
    startUrl.searchParams.set('loopback', listener.redirectUri);
    startUrl.searchParams.set('state', state);

    write('\n  Agent Sam · Google Cloud connection\n');
    write('  ────────────────────────────────────────────────────────\n');
    write('  Studio Web OAuth broker (GOOGLE_CLIENT_ID + Worker secret).\n');
    write('  Desktop PKCE is optional via: agentsam gcloud auth login --desktop\n');
    write(`  Studio     ${studioOrigin}\n`);
    write(`  Loopback   ${listener.redirectUri}\n`);
    write('  Scopes\n');
    for (const s of GOOGLE_CLOUD_CONNECTION_SCOPES.split(/\s+/).filter(Boolean)) {
      write(`    • ${s}\n`);
    }
    write('\n');

    if (!options.noLaunchBrowser) {
      const promptImpl = options.promptToOpenUrlImpl || promptToOpenUrl;
      await promptImpl(startUrl.toString(), {
        heading: '  Continue to Agent Sam (Google Cloud) at:',
        prompt: 'Press ENTER to open Google via Local Studio. When you finish, this terminal continues automatically.',
        input: options.input,
        output: options.output,
        openImpl: options.openImpl || openExternalUrl,
      });
    } else {
      write(`  Open this URL manually:\n  ${startUrl}\n\n`);
    }

    write('  Waiting for Studio → loopback handoff…\n');
    const callback = await listener.waitForCallback();
    write('  ✓ Loopback handoff received\n');
    try { await listener.close(); } catch { /* ignore */ }

    if (!callback?.pickup) {
      throw Object.assign(new Error('studio_pickup_missing'), { code: 'studio_pickup_missing' });
    }

    write('  Collecting tokens from Studio…\n');
    const pickupRes = await fetchImpl(new URL('/api/oauth/google/cli-cloud/pickup', `${studioOrigin}/`).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ pickup: callback.pickup, state }),
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(20_000) : undefined,
    });
    const pickup = await pickupRes.json().catch(() => ({}));
    if (!pickupRes.ok || !pickup.access_token) {
      throw Object.assign(
        new Error(`studio_pickup_failed: ${pickup.error || pickupRes.status}`),
        { code: 'studio_pickup_failed' },
      );
    }

    const email = clean(pickup.email) || null;
    const expiresAt = pickup.expires_at
      ? new Date(Number(pickup.expires_at) * 1000).toISOString()
      : null;

    const credentialPayload = JSON.stringify({
      schema_version: 'agentsam-google-oauth-token-v1',
      access_token: pickup.access_token,
      refresh_token: pickup.refresh_token || null,
      token_type: pickup.token_type || 'Bearer',
      scope: pickup.scope || GOOGLE_CLOUD_CONNECTION_SCOPES,
      expires_at: expiresAt,
      email,
      client_id: clean(env.GOOGLE_CLIENT_ID) || 'studio_web_broker',
      exchange_via: 'studio_web_broker',
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
    write('  Via        Local Studio Web OAuth broker\n');
    write('  Next\n');
    write('    agentsam google-cloud connection set --project PROJECT_ID\n');
    write('    agentsam google-cloud doctor\n');
    write('\n');

    return {
      ok: true,
      email,
      scopes: String(pickup.scope || GOOGLE_CLOUD_CONNECTION_SCOPES).split(/\s+/).filter(Boolean),
      expires_at: expiresAt,
      has_refresh_token: Boolean(pickup.refresh_token),
      exchange_via: 'studio_web_broker',
    };
  } finally {
    try { await listener.close(); } catch { /* already closed */ }
  }
}
