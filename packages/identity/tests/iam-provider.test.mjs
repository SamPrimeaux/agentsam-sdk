import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getIamAuthUrl,
  IAM_DEFAULT_OIDC_SCOPE,
  IAM_IDENTITY_AUTHORIZE_PATH,
  IAM_IDENTITY_TOKEN_PATH,
  IAM_IDENTITY_USERINFO_PATH,
} from '../src/providers/iam/oauth.js';
import { normalizeIamIdentity } from '../src/providers/iam/mapper.js';
import { createIamIdentityProvider } from '../src/providers/iam/index.js';

describe('iam identity provider', () => {
  it('builds authorize URL against identity AS path', () => {
    const url = new URL(
      getIamAuthUrl({
        issuer: 'https://inneranimalmedia.com',
        clientId: 'iam_identity_test',
        redirectUri: 'https://legendary.example/api/oauth/iam/callback',
        state: 'st_test',
        codeChallenge: 'challenge',
        scope: IAM_DEFAULT_OIDC_SCOPE,
      }),
    );
    assert.equal(url.origin + url.pathname, `https://inneranimalmedia.com${IAM_IDENTITY_AUTHORIZE_PATH}`);
    assert.equal(url.searchParams.get('client_id'), 'iam_identity_test');
    assert.equal(url.searchParams.get('scope'), 'openid profile email');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  });

  it('normalizes OIDC userinfo into external identity', () => {
    const normalized = normalizeIamIdentity({
      sub: 'au_test',
      email: 'sam@example.com',
      email_verified: true,
      name: 'Sam',
    });
    assert.equal(normalized.provider, 'iam');
    assert.equal(normalized.subject, 'au_test');
    assert.equal(normalized.email, 'sam@example.com');
    assert.equal(normalized.emailVerified, true);
    assert.equal(normalized.name, 'Sam');
  });

  it('createIamIdentityProvider binds issuer into profile fetch path', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    globalThis.fetch = async (input) => {
      capturedUrl = String(input);
      return new Response(JSON.stringify({ sub: 'au_x', email: 'x@example.com', name: 'X' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    try {
      const provider = createIamIdentityProvider('https://staging.inneranimalmedia.com');
      const profile = await provider.getProfile('token_abc');
      assert.ok(profile?.sub);
      assert.equal(
        capturedUrl,
        `https://staging.inneranimalmedia.com${IAM_IDENTITY_USERINFO_PATH}`,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('documents token path constant for exchange helper', () => {
    assert.equal(IAM_IDENTITY_TOKEN_PATH, '/api/oauth/identity/token');
  });
});
