import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertConnectionOwner,
  cloudflareConnectionSafeStatus,
  resolveCloudflareOAuthClient,
} from '../src/index.js';
import { handleCloudflareConnectionRequest } from '../src/routes.js';

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
    assert.equal(status.token_auth_method, 'none_pkce');
    assert.equal(status.configured, false);
  });

  it('denies cross-account connection access', () => {
    const record = { ownerId: 'sam', connectionId: 'c1' };
    assert.throws(() => assertConnectionOwner(record, 'connor'), /cloudflare_connection_forbidden/);
    assert.equal(assertConnectionOwner(record, 'sam').connectionId, 'c1');
  });

  it('supports a production PKCE client with no client secret', () => {
    const client = resolveCloudflareOAuthClient({
      CLOUDFLARE_OAUTH_CLIENT_ID: 'real-client-id',
    });
    assert.equal(client.productionReady, true);
    assert.equal(client.clientIdConfigured, true);
    assert.equal(client.tokenAuthMethod, 'none_pkce');
  });

  it('keeps connector return paths same-origin', async () => {
    const calls = [];
    const DB = {
      prepare(sql) {
        return {
          args: [],
          bind(...args) { this.args = args; return this; },
          async run() { calls.push({ sql, args: this.args }); return { success: true }; },
        };
      },
    };
    const response = await handleCloudflareConnectionRequest(
      new Request('https://agentsam.example/api/connections/cloudflare/start?return_to=https://untrusted.example/after', {
        headers: { authorization: 'Bearer fixture' },
      }),
      {
        DB,
        fixtureSessions: new Map([['fixture', 'user_123']]),
        CLOUDFLARE_OAUTH_CLIENT_ID: 'real-client-id',
      },
    );
    assert.equal(response.status, 200);
    assert.equal(
      calls.some((call) => call.sql.includes('DELETE FROM agentsam_cloudflare_oauth_state WHERE created_at < unixepoch() - 600')),
      true,
    );
    const stateInsert = calls.find((call) => call.sql.includes('INSERT INTO agentsam_cloudflare_oauth_state'));
    assert.ok(stateInsert);
    assert.equal(stateInsert.args.at(-1), null);
  });

  it('consumes callback state and stores only encrypted OAuth tokens', async () => {
    const now = Math.floor(Date.now() / 1000);
    const calls = [];
    const statements = [];
    const DB = {
      prepare(sql) {
        const statement = {
          sql,
          args: [],
          bind(...args) {
            this.args = args;
            return this;
          },
          async first() {
            if (sql.includes('agentsam_cloudflare_oauth_state')) {
              return { owner_id: 'user_123', code_verifier: 'verifier', created_at: now };
            }
            return null;
          },
          async run() {
            calls.push({ sql, args: this.args });
            return { success: true };
          },
        };
        statements.push(statement);
        return statement;
      },
      async batch(batchStatements) {
        for (const statement of batchStatements) await statement.run();
        return batchStatements.map(() => ({ success: true }));
      },
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_input, init) => {
      const body = new URLSearchParams(init.body);
      assert.equal(body.get('client_secret'), null);
      return new Response(JSON.stringify({
        access_token: 'access-plaintext',
        refresh_token: 'refresh-plaintext',
        account_id: 'account_123',
        scope: 'd1.read workers-scripts.write',
        expires_in: 3600,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    try {
      const response = await handleCloudflareConnectionRequest(
        new Request('https://agentsam.example/api/connections/cloudflare/callback?code=code_123&state=state_123'),
        {
          DB,
          CLOUDFLARE_OAUTH_CLIENT_ID: 'real-client-id',
          CLOUDFLARE_OAUTH_CLIENT_SECRET: 'obsolete-secret-must-not-be-sent',
          VAULT_MASTER_KEY: '01234567890123456789012345678901',
        },
      );
      assert.equal(response.status, 302);
      assert.equal(
        response.headers.get('location'),
        'https://agentsam.example/settings/integrations?connection=cloudflare&result=connected',
      );
      assert.equal(calls.some((call) => call.sql.includes('DELETE FROM agentsam_cloudflare_oauth_state')), true);
      const insert = calls.find((call) => call.sql.includes('INSERT INTO agentsam_cloudflare_connections'));
      assert.ok(insert);
      assert.notEqual(insert.args[4], 'access-plaintext');
      assert.notEqual(insert.args[5], 'refresh-plaintext');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
