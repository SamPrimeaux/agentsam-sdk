import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import { createAuthPortalPreviewServer } from '../scripts/preview-auth-portal.mjs';

describe('auth portal preview server', () => {
  /** @type {import('node:http').Server | null} */
  let server = null;
  let baseUrl = '';

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('serves IAM auth paths and login HTML', async () => {
    const started = await createAuthPortalPreviewServer({ port: 0, host: '127.0.0.1' });
    server = started.server;
    baseUrl = started.baseUrl;

    const loginRes = await fetch(`${baseUrl}/auth/login`);
    assert.equal(loginRes.status, 200);
    const loginHtml = await loginRes.text();
    assert.match(loginHtml, /Sign in \| Inner Animal Media/);

    const signupRes = await fetch(`${baseUrl}/auth/signup`);
    assert.equal(signupRes.status, 200);

    const apiRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'preview@example.com', password: 'preview' }),
    });
    const apiJson = await apiRes.json();
    assert.equal(apiJson.ok, true);
    assert.equal(apiJson.redirect, '/preview/dashboard');
  });
});
