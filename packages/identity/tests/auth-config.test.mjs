import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AGENTSAM_AUTH_CONTRACT,
  buildApiAuthorizationHeaders,
  resolveApiKey,
  resolveBridgeKey,
  resolveIamOrigin,
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
    assert.equal(resolveIamOrigin({ IAM_ORIGIN: 'https://legacy.example.test/' }), 'https://legacy.example.test');
  });

  it('fails loud when neither IAM_OAUTH_ISSUER nor IAM_ORIGIN exists', () => {
    assert.throws(
      () => resolveIamOrigin({}),
      (err) => err?.code === 'iam_oauth_issuer_not_configured',
    );
  });

  it('resolves only AGENTSAM_API_KEY for delegated account API auth', () => {
    assert.equal(resolveApiKey({ AGENTSAM_API_KEY: 'aak_new' }), 'aak_new');
    assert.equal(resolveApiKey({ AGENTSAM_SDK_KEY: 'sdk_old' }), '');
    assert.equal(AGENTSAM_AUTH_CONTRACT.apiKey.durableStore, 'agentsam_api_credentials');
  });

  it('never aliases bridge machine trust to an account API key', () => {
    assert.equal(
      resolveBridgeKey({ AGENTSAM_BRIDGE_KEY: 'bridge_machine', AGENTSAM_API_KEY: 'aak_user' }),
      'bridge_machine',
    );
    assert.equal(resolveBridgeKey({ AGENTSAM_API_KEY: 'aak_user' }), '');
    assert.equal(AGENTSAM_AUTH_CONTRACT.bridge.userAuth, false);
  });

  it('builds Bearer authorization only for aak_ API keys', () => {
    assert.deepEqual(buildApiAuthorizationHeaders('aak_abc', { Accept: 'application/json' }), {
      Accept: 'application/json',
      Authorization: 'Bearer aak_abc',
    });
    assert.throws(() => buildApiAuthorizationHeaders('bridge_machine'), /AGENTSAM_API_KEY_required/);
  });
});
