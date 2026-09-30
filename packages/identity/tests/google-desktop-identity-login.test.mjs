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

test('desktop identity login requires GOOGLE_DESKTOP_CLIENT_ID, not web client', async () => {
  const response = await handleGoogleDesktopLoginExchangeRequest(
    request({
      code: 'code',
      code_verifier: 'A'.repeat(64),
      redirect_uri: 'http://127.0.0.1:42311/callback',
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

test('desktop identity login provisions AgentSam desktop session and does not return Google tokens', async () => {
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
      code: 'code',
      code_verifier: 'A'.repeat(64),
      redirect_uri: 'http://127.0.0.1:42311/callback',
      client_id: DESKTOP_ID,
    }),
    { GOOGLE_DESKTOP_CLIENT_ID: DESKTOP_ID },
    {
      identity,
      adapter,
      fetchImpl: async () => Response.json({
        access_token: 'google-access-token-that-must-not-be-returned',
        refresh_token: 'google-refresh-token-that-must-not-be-returned',
      }),
      fetchProfile: async () => ({
        sub: 'google-user-1',
        email: 'sam@example.com',
        name: 'Sam',
      }),
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.session_id, 'sess_desktop_1');
  assert.equal(body.authenticated, true);
  assert.equal(body.user.email, 'sam@example.com');
  assert.equal('access_token' in body, false);
  assert.equal('refresh_token' in body, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, 'google');
  assert.equal(calls[0].sessionType, 'desktop');
});
