import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DESKTOP_CLIENT_ID,
  DESKTOP_REDIRECT_URI,
  handleDesktopExchangeRequest,
  handleDesktopRefreshRequest,
  handleDesktopSessionRequest,
  readDesktopOAuthIntent,
} from '../src/oauth/desktop-handoff.js';
import { pkceChallenge } from '../src/oauth/pkce.js';

const verifier = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';

describe('desktop OAuth handoff', () => {
  it('accepts only the registered Local Studio client and callback', () => {
    const url = new URL('https://agentsam.inneranimalmedia.com/api/oauth/cloudflare/start');
    url.searchParams.set('desktop', '1');
    url.searchParams.set('desktop_state', 'a'.repeat(43));
    url.searchParams.set('desktop_code_challenge', 'b'.repeat(43));
    url.searchParams.set('desktop_client_id', DESKTOP_CLIENT_ID);
    url.searchParams.set('desktop_redirect_uri', DESKTOP_REDIRECT_URI);
    assert.equal(readDesktopOAuthIntent(url).redirectUri, DESKTOP_REDIRECT_URI);
    url.searchParams.set('desktop_redirect_uri', 'https://attacker.invalid/callback');
    assert.throws(() => readDesktopOAuthIntent(url), /invalid_desktop_oauth_request/);
  });

  it('exchanges a one-time PKCE-bound code and emits a rotating refresh secret', async () => {
    const challenge = await pkceChallenge(verifier);
    let consumed = false;
    let storedRefresh = null;
    const adapter = {
      async consumeDesktopHandoff() {
        if (consumed) return null;
        consumed = true;
        return {
          session_id: 'sess_desktop',
          provider: 'cloudflare',
          code_challenge: challenge,
        };
      },
      async getSession() {
        return {
          id: 'sess_desktop',
          user_id: 'au_test',
          email: 'test@example.com',
          display_name: 'Test',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        };
      },
      async createDesktopRefreshToken(value) {
        storedRefresh = value;
      },
    };
    const request = () => new Request('https://agentsam.inneranimalmedia.com/api/oauth/desktop/exchange', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: 'c'.repeat(43),
        state: 's'.repeat(43),
        code_verifier: verifier,
        client_id: DESKTOP_CLIENT_ID,
        redirect_uri: DESKTOP_REDIRECT_URI,
      }),
    });
    const response = await handleDesktopExchangeRequest(request(), adapter);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.access_token, 'sess_desktop');
    assert.equal(body.provider, 'cloudflare');
    assert.ok(body.refresh_token.length >= 43);
    assert.ok(storedRefresh?.tokenHash);
    assert.notEqual(storedRefresh.tokenHash, body.refresh_token);

    const replay = await handleDesktopExchangeRequest(request(), adapter);
    assert.equal(replay.status, 400);
    assert.equal((await replay.json()).error, 'invalid_or_expired_code');
  });

  it('rotates refresh tokens and returns a fresh desktop session', async () => {
    let storedRefresh = null;
    const adapter = {
      async consumeDesktopRefreshToken() {
        return { user_id: 'au_test', provider: 'inneranimalmedia' };
      },
      async findUserById() {
        return { id: 'au_test', email: 'test@example.com', display_name: 'Test' };
      },
      async createSession() {
        return { id: 'sess_rotated' };
      },
      async createDesktopRefreshToken(value) {
        storedRefresh = value;
      },
    };
    const response = await handleDesktopRefreshRequest(new Request(
      'https://agentsam.inneranimalmedia.com/api/oauth/desktop/refresh',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: 'r'.repeat(64), client_id: DESKTOP_CLIENT_ID }),
      },
    ), adapter);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.access_token, 'sess_rotated');
    assert.equal(body.provider, 'inneranimalmedia');
    assert.ok(storedRefresh?.tokenHash);
  });

  it('restores account state from a Bearer-backed identity session', async () => {
    const response = await handleDesktopSessionRequest(
      new Request('https://agentsam.inneranimalmedia.com/api/oauth/desktop/session'),
      {
        async sessionFromRequest() {
          return {
            session: { provider: 'cloudflare', expires_at: 123 },
            user: { id: 'au_test', email: 'test@example.com', display_name: 'Test' },
          };
        },
      },
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).authenticated, true);
  });
});
