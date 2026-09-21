import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleCloudflareConnectionRequest } from '../packages/connectors/cloudflare/src/routes.js';
import { rejectUntrustedOwnerHints } from '../packages/connectors/cloudflare/src/owner.js';

function req(url, { method = 'GET', headers = {}, body } = {}) {
  return new Request(url, { method, headers, body });
}

describe('cloudflare connector routes', () => {
  it('rejects unauthenticated status', async () => {
    const res = await handleCloudflareConnectionRequest(
      req('https://agentsam.inneranimalmedia.com/api/connections/cloudflare'),
      {},
    );
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.error, 'unauthenticated');
  });

  it('rejects browser-submitted owner hints', () => {
    const url = new URL('https://agentsam.inneranimalmedia.com/api/connections/cloudflare?account_id=evil');
    assert.throws(
      () => rejectUntrustedOwnerHints(req(url.toString()), url, {}),
      /untrusted_owner_hint/,
    );
  });

  it('returns 503 on start when only fixture credentials exist', async () => {
    const env = {
      CLOUDFLARE_OAUTH_CLIENT_ID: 'sillynotreal',
      CLOUDFLARE_OAUTH_CLIENT_SECRET: 'sillynotreal-secret',
      fixtureSessions: new Map([['sess_1', 'user-sam']]),
    };
    const res = await handleCloudflareConnectionRequest(
      req('https://agentsam.inneranimalmedia.com/api/connections/cloudflare/start', {
        headers: { cookie: 'agentsam_session=sess_1' },
      }),
      env,
    );
    assert.equal(res.status, 503);
    const json = await res.json();
    assert.equal(json.error, 'not_configured');
    assert.equal(json.fixture, true);
  });

  it('status stays safe and does not treat fixture as production configured', async () => {
    const env = {
      CLOUDFLARE_OAUTH_CLIENT_ID: 'sillynotreal',
      CLOUDFLARE_OAUTH_CLIENT_SECRET: 'sillynotreal-secret',
      fixtureSessions: new Map([['sess_1', 'user-sam']]),
    };
    const res = await handleCloudflareConnectionRequest(
      req('https://agentsam.inneranimalmedia.com/api/connections/cloudflare', {
        headers: { authorization: 'Bearer sess_1' },
      }),
      env,
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.configured, false);
    assert.equal(json.fixture, true);
    assert.equal(JSON.stringify(json).includes('sillynotreal-secret'), false);
  });

  it('rejects owner_id in the JSON body', async () => {
    const env = { fixtureSessions: new Map([['sess_1', 'user-sam']]) };
    const res = await handleCloudflareConnectionRequest(
      req('https://agentsam.inneranimalmedia.com/api/connections/cloudflare/disconnect', {
        method: 'POST',
        headers: { cookie: 'agentsam_session=sess_1', 'content-type': 'application/json' },
        body: JSON.stringify({ owner_id: 'evil' }),
      }),
      env,
    );
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error, 'untrusted_owner_hint');
  });

  it('rejects callback without a stored oauth state', async () => {
    const env = {
      CLOUDFLARE_OAUTH_CLIENT_ID: 'real-client-id',
      CLOUDFLARE_OAUTH_CLIENT_SECRET: 'real-client-secret-value',
      oauthState: new Map(),
    };
    const res = await handleCloudflareConnectionRequest(
      req('https://agentsam.inneranimalmedia.com/api/connections/cloudflare/callback?code=abc&state=missing'),
      env,
    );
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.error, 'cloudflare_connection_forbidden');
  });
});
