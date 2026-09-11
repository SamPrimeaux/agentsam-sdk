import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  requireIamPlatformCredentials,
  resolveIamPlatformCredentials,
  resolveOAuthCredentialLane,
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

  it('defaults Google/GitHub buttons to IAM when minted', () => {
    const env = {
      IAM_CLIENT_ID: 'iam_dcr_legendary',
      IAM_CLIENT_SECRET: 'secret',
    };
    const lane = resolveOAuthCredentialLane(env, 'google');
    assert.equal(lane?.lane, 'iam_platform');
    assert.equal(lane?.clientId, 'iam_dcr_legendary');
  });

  it('developer BYOK Google takes the Google button when set', () => {
    const env = {
      IAM_CLIENT_ID: 'iam_dcr_legendary',
      IAM_CLIENT_SECRET: 'secret',
      GOOGLE_CLIENT_ID: 'google-byok',
      GOOGLE_CLIENT_SECRET: 'gsecret',
    };
    const lane = resolveOAuthCredentialLane(env, 'google');
    assert.equal(lane?.lane, 'byok_google');
    assert.equal(lane?.clientId, 'google-byok');
    // IAM start path still resolves IAM
    assert.equal(resolveOAuthCredentialLane(env, 'iam')?.lane, 'iam_platform');
  });

  it('prefers IAM_OAUTH_ISSUER and exposes issuer as the canonical authority', () => {
    const creds = resolveIamPlatformCredentials({
      IAM_CLIENT_ID: 'c',
      IAM_CLIENT_SECRET: 's',
      IAM_ORIGIN: 'https://legacy.example.test/',
      IAM_OAUTH_ISSUER: 'https://iam.example.test/',
    });
    assert.equal(creds?.origin, 'https://iam.example.test');
    assert.equal(creds?.issuer, 'https://iam.example.test');
  });

  it('accepts IAM_ORIGIN only as a migration fallback', () => {
    const creds = resolveIamPlatformCredentials({
      IAM_CLIENT_ID: 'c',
      IAM_CLIENT_SECRET: 's',
      IAM_OAUTH_ISSUER: 'https://staging.inneranimalmedia.com/',
    });
    assert.equal(creds?.origin, 'https://staging.inneranimalmedia.com');
  });
});
