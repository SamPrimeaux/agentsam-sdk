import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveIamPlatformCredentials,
  resolveOAuthCredentialLane,
  usesIamPlatformOAuth,
} from '../src/oauth/credentials.js';

describe('oauth credentials', () => {
  it('prefers IAM platform lane when IAM_CLIENT_* are set', () => {
    const env = {
      IAM_CLIENT_ID: 'iam_dcr_legendary',
      IAM_CLIENT_SECRET: 'secret',
      GOOGLE_CLIENT_ID: 'google-byok',
      GOOGLE_CLIENT_SECRET: 'gsecret',
    };
    assert.equal(usesIamPlatformOAuth(env), true);
    const lane = resolveOAuthCredentialLane(env, 'google');
    assert.equal(lane?.lane, 'iam_platform');
    assert.equal(lane?.clientId, 'iam_dcr_legendary');
    assert.equal(lane?.issuer, 'https://inneranimalmedia.com');
  });

  it('falls back to BYOK google when IAM creds missing', () => {
    const env = {
      GOOGLE_CLIENT_ID: 'google-byok',
      GOOGLE_CLIENT_SECRET: 'gsecret',
    };
    assert.equal(usesIamPlatformOAuth(env), false);
    const lane = resolveOAuthCredentialLane(env, 'google');
    assert.equal(lane?.lane, 'byok_google');
    assert.equal(lane?.clientId, 'google-byok');
  });

  it('requires both IAM_CLIENT_ID and IAM_CLIENT_SECRET', () => {
    assert.equal(resolveIamPlatformCredentials({ IAM_CLIENT_ID: 'x' }), null);
    assert.equal(
      resolveIamPlatformCredentials({ IAM_CLIENT_ID: 'x', IAM_CLIENT_SECRET: 'y' })?.clientId,
      'x',
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
});
