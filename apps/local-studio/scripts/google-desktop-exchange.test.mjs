import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveGoogleExchangeSecret,
  handleGoogleDesktopExchangeRequest,
} from '../backend/worker/google-desktop-exchange.js';

describe('google desktop exchange broker', () => {
  it('uses optional desktop secret when configured', () => {
    const r = resolveGoogleExchangeSecret({
      GOOGLE_DESKTOP_CLIENT_ID: 'desktop.apps.googleusercontent.com',
      GOOGLE_DESKTOP_CLIENT_SECRET: 'desk-secret',
      GOOGLE_CLIENT_ID: 'web.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'web-secret',
    }, 'desktop.apps.googleusercontent.com');
    assert.equal(r.mode, 'desktop_with_optional_secret');
    assert.equal(r.clientSecret, 'desk-secret');
  });

  it('keeps desktop public when no desktop secret', () => {
    const r = resolveGoogleExchangeSecret({
      GOOGLE_DESKTOP_CLIENT_ID: 'desktop.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'web-secret',
    }, 'desktop.apps.googleusercontent.com');
    assert.equal(r.mode, 'desktop_public_pkce');
    assert.equal(r.clientSecret, null);
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

  it('returns remediation when Google demands secret and Worker has none', async () => {
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
            error: 'invalid_request',
            error_description: 'client_secret is missing.',
          }), { status: 400 }),
      },
    );
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, 'desktop_client_requires_secret');
    assert.ok(Array.isArray(body.remediation));
  });
});
