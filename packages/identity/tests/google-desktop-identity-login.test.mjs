import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleGoogleDesktopLoginExchangeRequest,
} from '../src/oauth/google-desktop-exchange.js';

const DESKTOP_ID = 'desktop-client.apps.googleusercontent.com';

function request(body) {
  return new Request('https://agentsam.test/api/oauth/google/desktop-login-exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('desktop identity handoff requires GOOGLE_DESKTOP_CLIENT_ID, not web client', async () => {
  const response = await handleGoogleDesktopLoginExchangeRequest(
    request({
      access_token: 'access',
      id_token: 'id-token',
      client_id: 'web-client.apps.googleusercontent.com',
    }),
    {
      GOOGLE_DESKTOP_CLIENT_ID: DESKTOP_ID,
      GOOGLE_CLIENT_ID: 'web-client.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'web-secret',
    },
    {
      identity: {},
      adapter: {},
    },
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'google_desktop_client_id_required');
});

test('desktop identity validates token audience and provisions AgentSam desktop session', async () => {
  const calls = [];
  const identity = {
    async provisionOAuthUser(input) {
      calls.push(input);
      return {
        authUserId: 'au_1',
        sessionId: 'sess_desktop_1',
        session: { expires_at: '2026-10-29T00:00:00.000Z' },
      };
    },
  };
  const adapter = {
    async findUserById() {
      return { id: 'au_1', email: 'sam@example.com', display_name: 'Sam' };
    },
    async logAuthEvent() {},
  };

  const response = await handleGoogleDesktopLoginExchangeRequest(
    request({
      access_token: 'transient-access-token',
      id_token: 'transient-id-token',
      client_id: DESKTOP_ID,
    }),
    { GOOGLE_DESKTOP_CLIENT_ID: DESKTOP_ID },
    {
      identity,
      adapter,
      fetchImpl: async (url) => {
        const parsed = new URL(String(url));
        assert.equal(parsed.hostname, 'oauth2.googleapis.com');
        assert.equal(parsed.searchParams.get('id_token'), 'transient-id-token');
        return Response.json({
          aud: DESKTOP_ID,
          iss: 'https://accounts.google.com',
          exp: String(Math.floor(Date.now() / 1000) + 300),
          sub: 'google-user-1',
          email: 'sam@example.com',
          email_verified: 'true',
        });
      },
      fetchProfile: async (accessToken) => {
        assert.equal(accessToken, 'transient-access-token');
        return {
          sub: 'google-user-1',
          email: 'sam@example.com',
          name: 'Sam',
        };
      },
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.session_id, 'sess_desktop_1');
  assert.equal(body.authenticated, true);
  assert.equal(body.exchange_mode, 'desktop_public_pkce_native_exchange');
  assert.equal(body.user.email, 'sam@example.com');
  assert.equal('access_token' in body, false);
  assert.equal('id_token' in body, false);
  assert.equal('refresh_token' in body, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, 'google');
  assert.equal(calls[0].sessionType, 'desktop');
});



test('desktop identity exchanges PKCE code server-side and uses provider-issued installed-app secret when required', async () => {
  const identity = {
    async provisionOAuthUser() {
      return {
        authUserId: 'au_code',
        sessionId: 'sess_code',
        session: { expires_at: '2026-10-29T00:00:00.000Z' },
      };
    },
  };
  const adapter = {
    async findUserById() {
      return { id: 'au_code', email: 'code@example.com', display_name: 'Code User' };
    },
    async logAuthEvent() {},
  };

  let tokenExchangeSeen = false;
  let tokenInfoSeen = false;
  const response = await handleGoogleDesktopLoginExchangeRequest(
    request({
      code: 'one-time-code',
      code_verifier: 'v'.repeat(64),
      redirect_uri: 'http://127.0.0.1:43123/callback',
      client_id: DESKTOP_ID,
    }),
    {
      GOOGLE_DESKTOP_CLIENT_ID: DESKTOP_ID,
      GOOGLE_DESKTOP_CLIENT_SECRET: 'desktop-provider-secret',
    },
    {
      identity,
      adapter,
      fetchImpl: async (url, init = {}) => {
        const parsed = new URL(String(url));
        if (parsed.pathname === '/token') {
          tokenExchangeSeen = true;
          const form = new URLSearchParams(String(init.body || ''));
          assert.equal(form.get('client_id'), DESKTOP_ID);
          assert.equal(form.get('client_secret'), 'desktop-provider-secret');
          assert.equal(form.get('code'), 'one-time-code');
          assert.equal(form.get('code_verifier'), 'v'.repeat(64));
          return Response.json({
            access_token: 'server-exchanged-access',
            id_token: 'server-exchanged-id',
          });
        }
        if (parsed.pathname === '/tokeninfo') {
          tokenInfoSeen = true;
          assert.equal(parsed.searchParams.get('id_token'), 'server-exchanged-id');
          return Response.json({
            aud: DESKTOP_ID,
            iss: 'https://accounts.google.com',
            exp: String(Math.floor(Date.now() / 1000) + 300),
            sub: 'google-code-user',
            email: 'code@example.com',
            email_verified: 'true',
          });
        }
        throw new Error('unexpected_google_url:' + parsed.toString());
      },
      fetchProfile: async (accessToken) => {
        assert.equal(accessToken, 'server-exchanged-access');
        return {
          sub: 'google-code-user',
          email: 'code@example.com',
          name: 'Code User',
        };
      },
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.authenticated, true);
  assert.equal(body.session_id, 'sess_code');
  assert.equal(tokenExchangeSeen, true);
  assert.equal(tokenInfoSeen, true);
});

test('desktop identity rejects a Google token minted for another client', async () => {
  const response = await handleGoogleDesktopLoginExchangeRequest(
    request({
      access_token: 'access',
      id_token: 'id-token',
      client_id: DESKTOP_ID,
    }),
    { GOOGLE_DESKTOP_CLIENT_ID: DESKTOP_ID },
    {
      identity: {},
      adapter: {},
      fetchImpl: async () => Response.json({
        aud: 'another-client.apps.googleusercontent.com',
        iss: 'https://accounts.google.com',
        exp: String(Math.floor(Date.now() / 1000) + 300),
        sub: 'google-user-1',
        email: 'sam@example.com',
        email_verified: 'true',
      }),
    },
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'google_id_token_audience_mismatch');
});
