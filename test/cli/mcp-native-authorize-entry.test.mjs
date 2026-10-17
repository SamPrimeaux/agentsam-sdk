import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { authenticateViaBrowser } from '../../src/lib/auth.js';

const RESOURCE = 'https://mcp.inneranimalmedia.com/mcp';

test('native MCP connection enters canonical IAM authorize endpoint, not long nested login?next', async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-oauth-entry-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  let browserUrl = null;
  let codeExchange = null;
  const grant = await authenticateViaBrowser({
    home,
    env: {},
    scope: 'openid mcp:tools',
    resource: RESOURCE,
    saveSession: false,
    promptToOpenUrlImpl: async url => {
      browserUrl = new URL(url);
      assert.equal(browserUrl.origin, 'https://inneranimalmedia.com');
      assert.equal(browserUrl.pathname, '/api/oauth/authorize');
      assert.equal(browserUrl.searchParams.has('next'), false);
      assert.equal(browserUrl.searchParams.get('resource'), RESOURCE);
      assert.equal(browserUrl.searchParams.get('client_id'), 'iam_cli_agentsam');
      const redirect = new URL(browserUrl.searchParams.get('redirect_uri'));
      assert.equal(redirect.hostname, '127.0.0.1');
      redirect.searchParams.set('code', 'test-code');
      redirect.searchParams.set('state', browserUrl.searchParams.get('state'));
      const callback = await fetch(redirect.href);
      assert.equal(callback.status, 200);
    },
    fetchImpl: async (url, opts) => {
      codeExchange = { url, body: new URLSearchParams(opts.body) };
      return { ok: true, json: async () => ({ access_token: 'mcp-fixture', scope: 'openid mcp:tools' }) };
    },
  });
  assert.equal(grant.access_token, 'mcp-fixture');
  assert.equal(codeExchange.body.get('resource'), RESOURCE);
  assert.equal(codeExchange.body.get('grant_type'), 'authorization_code');
  assert.equal(codeExchange.url, 'https://inneranimalmedia.com/api/oauth/token');
  assert.equal(fs.existsSync(path.join(home, '.agentsam', 'auth', 'session.json')), false);
});

test('unscoped ordinary CLI login preserves its previous login entry route', async () => {
  let received;
  await assert.rejects(authenticateViaBrowser({
    promptToOpenUrlImpl: async url => {
      received = new URL(url);
      throw new Error('test_url_captured');
    },
  }), /test_url_captured/);
  assert.equal(received.pathname, '/auth/login');
  const nested = new URL(received.searchParams.get('next'), received.origin);
  assert.equal(nested.pathname, '/api/oauth/authorize');
  assert.equal(nested.searchParams.has('resource'), false);
});
