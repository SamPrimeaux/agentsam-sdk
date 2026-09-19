import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getJson } from '../../src/lib/core-client.js';
import { saveAccountSession } from '../../src/lib/account-session.js';

test('core client accepts an already-resolved browser OAuth bearer without reclassifying it as an API key', async () => {
  let authorization = '';
  const result = await getJson('/api/sdk/context', {
    bearer: 'browser_oauth_access_token',
    env: { IAM_OAUTH_ISSUER: 'https://iam.example.test' },
    fetchImpl: async (_url, options) => {
      authorization = options.headers.Authorization;
      return { ok: true, async json() { return { ok: true }; } };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(authorization, 'Bearer browser_oauth_access_token');
});

test('legacy string credential form is treated as a resolved bearer for both API keys and OAuth tokens', async () => {
  const original = globalThis.fetch;
  let authorization = '';
  globalThis.fetch = async (_url, options) => {
    authorization = options.headers.Authorization;
    return { ok: true, async json() { return { ok: true }; } };
  };
  try {
    await getJson('/api/sdk/context', 'browser_oauth_access_token');
    assert.equal(authorization, 'Bearer browser_oauth_access_token');
  } finally {
    globalThis.fetch = original;
  }
});

test('core client refreshes browser OAuth once when IAM returns 401 before local expiry', async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-core-client-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  saveAccountSession({ access_token: 'stale_browser_token', refresh_token: 'refresh_token', expires_in: 3600 }, { home });
  const seen = [];
  const result = await getJson('/api/sdk/context', {
    home,
    env: { IAM_OAUTH_ISSUER: 'https://iam.example.test' },
    refreshImpl: async () => ({ access_token: 'fresh_browser_token', refresh_token: 'refresh_token' }),
    fetchImpl: async (_url, options) => {
      seen.push(options.headers.Authorization);
      const ok = seen.length > 1;
      return { ok, status: ok ? 200 : 401, async json() { return ok ? { ok: true } : { error: 'Unauthorized' }; } };
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(seen, ['Bearer stale_browser_token', 'Bearer fresh_browser_token']);
});
