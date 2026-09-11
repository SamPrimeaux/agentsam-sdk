import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import worker, { sdkWorkerHealth } from '../worker/index.js';

const wrangler = fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const workmode = fs.readFileSync(new URL('../apps/local-studio/backend/wrangler.workmode.toml', import.meta.url), 'utf8');

test('root Wrangler config owns the agentsam-sdk DB/R2/auth contract', () => {
  assert.match(wrangler, /"name"\s*:\s*"agentsam-sdk"/);
  assert.match(wrangler, /"binding"\s*:\s*"DB"/);
  assert.match(wrangler, /"database_name"\s*:\s*"inneranimalmedia-business"/);
  assert.match(wrangler, /"binding"\s*:\s*"WEBSITE_ASSETS"/);
  assert.match(wrangler, /"bucket_name"\s*:\s*"agentsam-os-blueprint-content"/);
  assert.match(wrangler, /"IAM_ORIGIN"\s*:\s*"https:\/\/inneranimalmedia\.com"/);
  assert.doesNotMatch(wrangler, /AGENTSAM_WORKER_ROLE/);
  assert.doesNotMatch(wrangler, /IAM_OAUTH_ISSUER/);
  assert.doesNotMatch(wrangler, /AGENTSAM_SDK_TOKEN/);
  assert.doesNotMatch(wrangler, /OLLAMA_BASE_URL|OLLAMA_MODEL|OLLAMA_EMBED_MODEL/);
});

test('Workers AI may remain an optional edge capability but Ollama does not', () => {
  assert.match(wrangler, /"binding"\s*:\s*"AGENTSAM_WAI"/);
  assert.doesNotMatch(wrangler, /OLLAMA/);
});

test('Workmode no longer owns the SDK WEBSITE_ASSETS binding', () => {
  assert.doesNotMatch(workmode, /binding = "WEBSITE_ASSETS"/);
  assert.doesNotMatch(workmode, /bucket_name = "agentsam-os-blueprint-content"/);
});

test('SDK Worker health proves configured roles without exposing secret values', async () => {
  const env = {
    DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) },
    WEBSITE_ASSETS: { head: async () => null },
    AGENTSAM_WAI: {},
    IAM_ORIGIN: 'https://inneranimalmedia.com/',
    IAM_CLIENT_ID: 'iam_sdk_public',
    IAM_CLIENT_SECRET: 'do-not-return',
    AGENTSAM_SDK_KEY: 'sdk_do-not-return',
    AGENTSAM_BRIDGE_KEY: 'bridge-do-not-return',
  };
  const health = await sdkWorkerHealth(env);
  assert.equal(health.ok, true);
  assert.equal(health.service, 'agentsam-sdk');
  assert.equal(health.contract, 'sdk-identity-auth/v1');
  assert.equal(health.storage.db.reachable, true);
  assert.equal(health.storage.website_assets.reachable, true);
  assert.equal(health.ai.workers_ai.configured, true);
  assert.deepEqual(health.ai.ollama, { edge_binding: false, local_cli: true });
  assert.deepEqual(health.auth, {
    iam_origin: 'https://inneranimalmedia.com',
    iam_client_id: true,
    iam_client_secret: true,
    agentsam_sdk_key: true,
    agentsam_bridge_key: true,
  });

  const response = await worker.fetch(new Request('https://sdk.example/health'), env);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.equal(text.includes('do-not-return'), false);
  assert.equal(text.includes('sdk_do-not-return'), false);
  assert.equal(text.includes('bridge-do-not-return'), false);
  assert.equal(text.includes('AGENTSAM_WORKER_ROLE'), false);
});
