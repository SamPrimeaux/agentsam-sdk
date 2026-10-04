import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveGoogleExchangeSecret,
  handleGoogleDesktopExchangeRequest,
} from '../backend/worker/goaude.js';

describe('google desktop exchange broker', () => {
  it('always treats the configured desktop client as public PKCE', () => {
    const r = resolveGoogleExchangeSecret({
      GOOGLE_DESKTOP_CLIENT_ID: 'desktop.apps.googleusercontent.com',
      GOOGLE_CLIENT_ID: 'web.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'web-secret',
    }, 'desktop.apps.googleusercontent.com');
    assert.equal(r.mode, 'desktop_public_pkce');
    assert.equal(r.clientSecret, null);
  });

  it('keeps the hosted web client confidential', () => {
    const r = resolveGoogleExchangeSecret({
      GOOGLE_DESKTOP_CLIENT_ID: 'desktop.apps.googleusercontent.com',
      GOOGLE_CLIENT_ID: 'web.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'web-secret',
    }, 'web.apps.googleusercontent.com');
    assert.equal(r.mode, 'web_confidential');
    assert.equal(r.clientSecret, 'web-secret');
  });

  it('rejects non-loopback redirect and unknown clients', async () => {
    const res = await handleGoogleDesktopExchangeRequest(
      new Request('https://agentsam.example/api/oauth/google/desktop-exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'c',
          code_verifier: 'v',
          redirect_uri: 'https://evil.example/callback',
          client_id: 'desktop.apps.googleusercontent.com',
        }),
      }),
      { GOOGLE_DESKTOP_CLIENT_ID: 'desktop.apps.googleusercontent.com' },
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'redirect_uri_must_be_loopback');
  });

  it('returns the upstream exchange failure without inventing secret remediation', async () => {
    const res = await handleGoogleDesktopExchangeRequest(
      new Request('https://agentsam.example/api/oauth/google/desktop-exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'c',
          code_verifier: 'v',
          redirect_uri: 'http://127.0.0.1:9/callback',
          client_id: 'desktop.apps.googleusercontent.com',
        }),
      }),
      { GOOGLE_DESKTOP_CLIENT_ID: 'desktop.apps.googleusercontent.com' },
      {
        fetchImpl: async () =>
          new Response(JSON.stringify({
            error: 'invalid_grant',
            error_description: 'authorization code rejected',
          }), { status: 400 }),
      },
    );
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, 'google_token_exchange_failed');
    assert.equal('remediation' in body, false);
  });
});
