import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertConnectionOwner,
  cloudflareConnectionSafeStatus,
  resolveCloudflareOAuthClient,
} from '../src/index.js';

describe('cloudflare connector', () => {
  it('reports not_configured when credentials are absent', () => {
    const client = resolveCloudflareOAuthClient({});
    assert.equal(client.status, 'not_configured');
    assert.equal(client.configured, false);
    assert.equal(client.productionReady, false);
  });

  it('loads fake fixtures without treating them as production authority', () => {
    const client = resolveCloudflareOAuthClient({
      CLOUDFLARE_OAUTH_CLIENT_ID: 'sillynotreal',
      CLOUDFLARE_OAUTH_CLIENT_SECRET: 'sillynotreal-secret',
    });
    assert.equal(client.configured, true);
    assert.equal(client.fixture, true);
    assert.equal(client.productionReady, false);
    assert.equal(client.status, 'fixture');
  });

  it('never includes secrets in safe status output', () => {
    const status = cloudflareConnectionSafeStatus({
      CLOUDFLARE_OAUTH_CLIENT_ID: 'sillynotreal',
      CLOUDFLARE_OAUTH_CLIENT_SECRET: 'sillynotreal-secret',
    });
    const blob = JSON.stringify(status);
    assert.equal(blob.includes('sillynotreal-secret'), false);
    assert.equal(status.secret, 'configured');
    assert.equal(status.configured, false);
  });

  it('denies cross-account connection access', () => {
    const record = { ownerId: 'sam', connectionId: 'c1' };
    assert.throws(() => assertConnectionOwner(record, 'connor'), /cloudflare_connection_forbidden/);
    assert.equal(assertConnectionOwner(record, 'sam').connectionId, 'c1');
  });
});
