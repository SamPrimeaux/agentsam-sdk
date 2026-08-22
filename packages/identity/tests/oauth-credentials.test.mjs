import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  requireIamPlatformCredentials,
  resolveIamPlatformCredentials,
} from '../src/oauth/credentials.js';

describe('oauth credentials', () => {
  it('requires IAM_CLIENT_ID and IAM_CLIENT_SECRET together', () => {
    assert.equal(resolveIamPlatformCredentials({ IAM_CLIENT_ID: 'x' }), null);
    assert.equal(
      resolveIamPlatformCredentials({ IAM_CLIENT_ID: 'x', IAM_CLIENT_SECRET: 'y' })?.clientId,
      'x',
    );
  });

  it('requireIamPlatformCredentials throws when missing', () => {
    assert.throws(
      () => requireIamPlatformCredentials({}),
      (err) => err?.code === 'iam_oauth_not_configured',
    );
  });

  it('honors IAM_OAUTH_ISSUER override', () => {
    const creds = resolveIamPlatformCredentials({
      IAM_CLIENT_ID: 'c',
      IAM_CLIENT_SECRET: 's',
      IAM_OAUTH_ISSUER: 'https://staging.inneranimalmedia.com/',
    });
    assert.equal(creds?.issuer, 'https://staging.inneranimalmedia.com');
  });

  it('ignores legacy provider env vars — IAM only', () => {
    assert.equal(
      resolveIamPlatformCredentials({
        GOOGLE_CLIENT_ID: 'google-byok',
        GOOGLE_CLIENT_SECRET: 'gsecret',
      }),
      null,
    );
  });
});
