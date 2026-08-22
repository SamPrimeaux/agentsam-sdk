import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createIdentity,
  GoogleProvider,
  GithubProvider,
  getIdentityProvider,
} from '../src/index.js';

describe('@agentsam/identity', () => {
  it('createIdentity exposes provider registry', () => {
    const identity = createIdentity({
      providers: [GoogleProvider, GithubProvider],
      session: { cookie: 'test_session' },
    });
    assert.equal(identity.version, '1.0');
    assert.equal(identity.session.cookie, 'test_session');
    assert.equal(identity.getProvider('google')?.id, 'google');
  });

  it('GoogleProvider normalizes OpenID profile', () => {
    const out = GoogleProvider.normalizeIdentity({
      sub: 'google-sub-1',
      email: 'User@Example.com',
      email_verified: true,
      name: 'Test User',
      picture: 'https://example.com/a.png',
    });
    assert.equal(out.provider, 'google');
    assert.equal(out.subject, 'google-sub-1');
    assert.equal(out.email, 'user@example.com');
    assert.equal(out.emailVerified, true);
  });

  it('GithubProvider normalizes API profile', () => {
    const out = GithubProvider.normalizeIdentity({
      id: 42,
      login: 'sam',
      email: 'sam@example.com',
      email_verified: true,
    });
    assert.equal(out.provider, 'github');
    assert.equal(out.subject, '42');
    assert.equal(out.username, 'sam');
  });

  it('getIdentityProvider resolves built-ins', () => {
    assert.equal(getIdentityProvider('github')?.id, 'github');
    assert.equal(getIdentityProvider('missing'), null);
  });
});
