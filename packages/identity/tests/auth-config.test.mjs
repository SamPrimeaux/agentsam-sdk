import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AGENTSAM_AUTH_CONTRACT,
  buildSdkAuthorizationHeaders,
  resolveBridgeKey,
  resolveIamOrigin,
  resolveSdkKey,
} from '../src/contracts/auth-config.js';

describe('auth configuration contract', () => {
  it('prefers canonical IAM_OAUTH_ISSUER over IAM_ORIGIN', () => {
    assert.equal(
      resolveIamOrigin({
        IAM_ORIGIN: 'https://legacy.example.test/',
        IAM_OAUTH_ISSUER: 'https://canonical.example.test/',
      }),
      'https://canonical.example.test',
    );
  });

  it('accepts IAM_ORIGIN as migration-only fallback', () => {
    assert.equal(
      resolveIamOrigin({ IAM_ORIGIN: 'https://legacy.example.test/' }),
      'https://legacy.example.test',
    );
  });

  it('defaults issuer when neither IAM_OAUTH_ISSUER nor IAM_ORIGIN exists', () => {
    assert.equal(resolveIamOrigin({}), 'https://inneranimalmedia.com');
  });

  it('prefers AGENTSAM_SDK_KEY over AGENTSAM_SDK_TOKEN', () => {
    assert.equal(
      resolveSdkKey({
        AGENTSAM_SDK_KEY: 'sdk_new',
        AGENTSAM_SDK_TOKEN: 'sdk_old',
      }),
      'sdk_new',
    );
    assert.equal(resolveSdkKey({ AGENTSAM_SDK_TOKEN: 'sdk_old' }), 'sdk_old');
  });

  it('never aliases bridge machine trust to a user SDK key', () => {
    assert.equal(
      resolveBridgeKey({ AGENTSAM_BRIDGE_KEY: 'bridge_machine', AGENTSAM_SDK_KEY: 'sdk_user' }),
      'bridge_machine',
    );
    assert.equal(resolveBridgeKey({ AGENTSAM_SDK_KEY: 'sdk_user' }), '');
    assert.equal(AGENTSAM_AUTH_CONTRACT.bridge.userAuth, false);
    assert.equal(AGENTSAM_AUTH_CONTRACT.bridge.sdkTokenType, 'integration');
  });

  it('builds Bearer authorization only for sdk_ keys', () => {
    assert.deepEqual(buildSdkAuthorizationHeaders('sdk_abc', { Accept: 'application/json' }), {
      Accept: 'application/json',
      Authorization: 'Bearer sdk_abc',
    });
    assert.throws(() => buildSdkAuthorizationHeaders('bridge_machine'), /AGENTSAM_SDK_KEY_required/);
  });
});
