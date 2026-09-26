import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPublicConfig } from '../backend/worker/public-config.js';

describe('public-config', () => {
  it('exposes public Google client ids from Worker vars without secrets', () => {
    const cfg = buildPublicConfig({
      IAM_OAUTH_ISSUER: 'https://inneranimalmedia.com',
      IAM_CLIENT_ID: 'iam_agentsam_sdk_web',
      GOOGLE_CLIENT_ID: 'web-client.apps.googleusercontent.com',
      GOOGLE_DESKTOP_CLIENT_ID: 'desktop-client.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'must-not-appear',
      AGENTSAM_BRIDGE_KEY: 'must-not-appear',
    }, { origin: 'https://agentsam.inneranimalmedia.com' });

    assert.equal(cfg.schema, 'agentsam.public-config.v1');
    assert.equal(cfg.google_desktop_client_id, 'desktop-client.apps.googleusercontent.com');
    assert.equal(cfg.google_client_id, 'web-client.apps.googleusercontent.com');
    assert.equal(cfg.runtime_protocol, 'agentsam.runtime.v1');
    const blob = JSON.stringify(cfg);
    assert.equal(blob.includes('must-not-appear'), false);
    assert.equal(blob.includes('GOOGLE_CLIENT_SECRET'), false);
  });
});
