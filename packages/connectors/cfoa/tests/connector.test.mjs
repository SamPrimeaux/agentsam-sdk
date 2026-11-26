import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertConnectionOwner,
  cloudflareConnectionSafeStatus,
  resolveCloudflareOAuthClient,
} from '../src/index.js';
import { handleCloudflareConnectionRequest } from '../src/routes.js';

const permissionRegistry = {
  async getOAuthPermissionCatalog(providerKey) {
    assert.equal(providerKey, 'cloudflare');
    return {
      baselineScopes: ['offline_access', 'account-settings.read'],
      defaultPacks: ['watch'],
      allowFullCatalogOptIn: true,
      availablePermissions: [{ scope: 'catalog.extra.read', label: 'Extra', category: 'extra' }],
      aliases: { media: ['store', 'create'] },
      packs: [
        { id: 'watch', label: 'Watch', scopes: ['workers-observability.read'] },
        { id: 'store', label: 'Store', scopes: ['d1.read', 'd1.write'] },
        { id: 'create', label: 'Create', scopes: ['images.read', 'images.write'] },
      ],
      capabilities: [{ id: 'cloudflare.r2', scopes: ['workers-r2.read', 'workers-r2.write'] }],
    };
  },
};

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
    const oauthState = new Map();
    const response = await handleCloudflareConnectionRequest(
      new Request('https://agentsam.example/api/connections/cloudflare/start?return_to=https://untrusted.example/after', {
        headers: {
          authorization: 'Bearer fixture',
          accept: 'application/json',
        },
      }),
      {
        oauthState,
        fixtureSessions: new Map([['fixture', 'user_123']]),
        CLOUDFLARE_OAUTH_CLIENT_ID: 'real-client-id',
      },
      { permissionRegistry },
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(oauthState.size, 1);
    const stored = [...oauthState.values()][0];
    assert.equal(stored.returnTo, '');
  });

  it('redirects browser starts to Cloudflare authorization', async () => {
    const oauthState = new Map();
    const response = await handleCloudflareConnectionRequest(
      new Request('https://agentsam.example/api/connections/cloudflare/start', {
        headers: { authorization: 'Bearer fixture' },
      }),
      {
        fixtureSessions: new Map([['fixture', 'user_123']]),
        oauthState,
        CLOUDFLARE_OAUTH_CLIENT_ID: 'real-client-id',
      },
      { permissionRegistry },
    );

    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('location'));
    assert.equal(location.origin, 'https://dash.cloudflare.com');
    assert.equal(location.pathname, '/oauth2/auth');
    assert.equal(location.searchParams.get('client_id'), 'real-client-id');
    assert.equal(location.searchParams.get('redirect_uri'), 'https://agentsam.example/api/connections/cloudflare/callback');
    assert.equal(oauthState.size, 1);
  });


  it('lists host-owned permission packs without treating offerable scopes as granted', async () => {
    const response = await handleCloudflareConnectionRequest(
      new Request('https://agentsam.example/api/connections/cloudflare/permissions', {
        headers: { authorization: 'Bearer fixture', accept: 'application/json' },
      }),
      {
        fixtureSessions: new Map([['fixture', 'user_123']]),
        oauthState: new Map(),
      },
      { permissionRegistry },
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.ok(body.available_permissions.some((permission) => permission.scope === 'd1.write'));
    assert.ok(body.registered_packs.some((pack) => pack.pack_id === 'store'));
    assert.deepEqual(body.granted_scopes, []);
  });

  it('uses host-provided default packs and rejects unregistered pack IDs', async () => {
    const oauthState = new Map();
    const response = await handleCloudflareConnectionRequest(
      new Request('https://agentsam.example/api/connections/cloudflare/start', {
        headers: { authorization: 'Bearer fixture', accept: 'application/json' },
      }),
      {
        fixtureSessions: new Map([['fixture', 'user_123']]),
        oauthState,
        CLOUDFLARE_OAUTH_CLIENT_ID: 'real-client-id',
      },
      { permissionRegistry },
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.scopes.includes('workers-observability.read'));
    assert.ok(body.scopes.includes('account-settings.read'));

    const rejected = await handleCloudflareConnectionRequest(
      new Request('https://agentsam.example/api/connections/cloudflare/start?packs=not-registered', {
        headers: { authorization: 'Bearer fixture', accept: 'application/json' },
      }),
      {
        fixtureSessions: new Map([['fixture', 'user_123']]),
        oauthState: new Map(),
        CLOUDFLARE_OAUTH_CLIENT_ID: 'real-client-id',
      },
      { permissionRegistry },
    );
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).error, 'cloudflare_permission_pack_unavailable');
  });

  it('uses host-declared default capabilities when no explicit pack or capability is selected', async () => {
    const defaultCapabilityRegistry = {
      async getOAuthPermissionCatalog() {
        return {
          baselineScopes: ['offline_access'],
          defaultPacks: [],
          defaultCapabilities: ['cloudflare.r2'],
          capabilities: [{ id: 'cloudflare.r2', scopes: ['workers-r2.read', 'workers-r2.write'] }],
          packs: [],
        };
      },
    };
    const response = await handleCloudflareConnectionRequest(
      new Request('https://agentsam.example/api/connections/cloudflare/start', {
        headers: { authorization: 'Bearer fixture', accept: 'application/json' },
      }),
      {
        fixtureSessions: new Map([['fixture', 'user_123']]),
        oauthState: new Map(),
        CLOUDFLARE_OAUTH_CLIENT_ID: 'real-client-id',
      },
      { permissionRegistry: defaultCapabilityRegistry },
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.scopes.includes('workers-r2.read'));
    assert.ok(body.scopes.includes('workers-r2.write'));
    assert.ok(!body.scopes.includes('workers-observability.read'));
  });

  it('supports an explicit full-catalog opt-in without making it a default', async () => {
    const response = await handleCloudflareConnectionRequest(
      new Request('https://agentsam.example/api/connections/cloudflare/start?packs=all', {
        headers: { authorization: 'Bearer fixture', accept: 'application/json' },
      }),
      {
        fixtureSessions: new Map([['fixture', 'user_123']]),
        oauthState: new Map(),
        CLOUDFLARE_OAUTH_CLIENT_ID: 'real-client-id',
      },
      { permissionRegistry },
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.scopes.includes('catalog.extra.read'));
    assert.ok(body.scopes.includes('d1.write'));
  });

  it('fails closed when no host permission registry is injected', async () => {
    const response = await handleCloudflareConnectionRequest(
      new Request('https://agentsam.example/api/connections/cloudflare/start', {
        headers: { authorization: 'Bearer fixture', accept: 'application/json' },
      }),
      {
        fixtureSessions: new Map([['fixture', 'user_123']]),
        oauthState: new Map(),
        CLOUDFLARE_OAUTH_CLIENT_ID: 'real-client-id',
      },
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'cloudflare_permission_registry_unavailable');
  });

  it('consumes callback state and stores only encrypted OAuth tokens', async () => {
    const calls = [];
    const oauthState = new Map([
      ['state_123', {
        ownerId: 'user_123',
        verifier: 'verifier',
        returnTo: '',
        createdAt: Math.floor(Date.now() / 1000),
      }],
    ]);
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
            return null;
          },
          async run() {
            calls.push({ sql, args: this.args });
            return { success: true };
          },
        };
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
        account_id: 'abc123abc123abc123abc123abc123ab',
        scope: 'd1.read workers-scripts.write',
        expires_in: 3600,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    try {
      const response = await handleCloudflareConnectionRequest(
        new Request('https://agentsam.example/api/connections/cloudflare/callback?code=code_123&state=state_123'),
        {
          DB,
          oauthState,
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
      assert.equal(oauthState.has('state_123'), false);
      const insert = calls.find((call) => call.sql.includes('INSERT INTO user_oauth_tokens'));
      assert.ok(insert, 'expected user_oauth_tokens insert (SSOT)');
      // Encrypted-only: the table has no plaintext token columns.
      assert.ok(!/(^|[^_a-z])(access_token|refresh_token)[^_a-z]|tenant_id|workspace_id|person_uuid/.test(insert.sql.split('VALUES')[0]));
      assert.notEqual(insert.args[3], 'access-plaintext'); // access_token_encrypted
      assert.notEqual(insert.args[4], 'refresh-plaintext'); // refresh_token_encrypted
      assert.ok(insert.args[3] && insert.args[4]);
      assert.equal(calls.some((call) => call.sql.includes('agentsam_cloudflare_connections')), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
