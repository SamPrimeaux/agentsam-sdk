import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import worker, { sdkWorkerHealth } from '../worker/index.js';

const wrangler = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const workmode = fs.readFileSync(new URL('../apps/local-studio/backend/wrangler.workmode.toml', import.meta.url), 'utf8');

test('root Wrangler config owns the agentsam-sdk DB/R2/auth contract', () => {
  assert.match(wrangler, /^name = "agentsam-sdk"$/m);
  assert.match(wrangler, /^binding = "DB"$/m);
  assert.match(wrangler, /^database_name = "inneranimalmedia-business"$/m);
  assert.match(wrangler, /^binding = "WEBSITE_ASSETS"$/m);
  assert.match(wrangler, /^bucket_name = "agentsam-os-blueprint-content"$/m);
  assert.match(wrangler, /^IAM_ORIGIN = "https:\/\/inneranimalmedia\.com"$/m);
  assert.doesNotMatch(wrangler, /^IAM_OAUTH_ISSUER\s*=/m);
  assert.doesNotMatch(wrangler, /^AGENTSAM_SDK_TOKEN\s*=/m);
});

test('Workmode no longer owns the SDK WEBSITE_ASSETS binding', () => {
  assert.doesNotMatch(workmode, /binding = "WEBSITE_ASSETS"/);
  assert.doesNotMatch(workmode, /bucket_name = "agentsam-os-blueprint-content"/);
});

test('SDK Worker health proves configured roles without exposing secret values', async () => {
  const env = {
    DB: {},
    WEBSITE_ASSETS: {},
    IAM_ORIGIN: 'https://inneranimalmedia.com/',
    IAM_CLIENT_ID: 'iam_sdk_public',
    IAM_CLIENT_SECRET: 'do-not-return',
    AGENTSAM_SDK_KEY: 'sdk_do-not-return',
    AGENTSAM_BRIDGE_KEY: 'bridge-do-not-return',
  };
  assert.deepEqual(sdkWorkerHealth(env), {
    ok: true,
    service: 'agentsam-sdk',
    contract: 'sdk-identity-auth/v1',
    storage: { db: true, website_assets: true },
    auth: {
      iam_origin: 'https://inneranimalmedia.com',
      iam_client_id: true,
      iam_client_secret: true,
      agentsam_sdk_key: true,
      agentsam_bridge_key: true,
    },
  });

  const response = await worker.fetch(new Request('https://sdk.example/health'), env);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.equal(text.includes('do-not-return'), false);
  assert.equal(text.includes('sdk_do-not-return'), false);
  assert.equal(text.includes('bridge-do-not-return'), false);
});
