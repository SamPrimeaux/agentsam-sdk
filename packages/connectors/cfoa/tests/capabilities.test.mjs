import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  requestedCloudflareScopes,
  assertPermissionCatalogCoversAllScopes,
  listCloudflarePermissionProducts,
  scopesForCapabilities,
  assessCapabilityAuthorization,
  CloudflareApiClient,
  resolveCloudflareApiAuth,
  resolveCloudflareCredential,
  workflows,
  scanner,
  keyless,
  pages,
  snippets,
  getCloudflareCapability,
} from '../src/index.js';

describe('cloudflare capability-scoped auth', () => {
  const permissionCatalog = {
    baselineScopes: ['offline_access', 'account-settings.read'],
    defaultPacks: ['watch'],
    packs: [
      { id: 'watch', label: 'Watch', scopes: ['workers-observability.read'] },
      { id: 'store', label: 'Store', scopes: ['d1.read', 'd1.write'] },
    ],
    capabilities: [
      { id: 'cloudflare.r2', scopes: ['workers-r2.read', 'workers-r2.write'] },
      { id: 'cloudflare.analytics', scopes: ['account-analytics.read'] },
      { id: 'cloudflare.basin.read', scopes: ['pipelines.read', 'r2-catalog.read', 'r2-catalog-sql.read'] },
      { id: 'cloudflare.images', scopes: ['images.read', 'images.write'] },
      { id: 'cloudflare.url_scanner', scopes: ['url-scanner.read', 'url-scanner.write'] },
      { id: 'cloudflare.workflows', scopes: ['workers-scripts.read', 'workers-scripts.write'] },
      { id: 'cloudflare.pages', scopes: ['page.read', 'page.write'] },
      { id: 'cloudflare.keyless_ssl', scopes: ['ssl-and-certificates.read', 'ssl-and-certificates.write'] },
    ],
    availablePermissions: [
      { scope: 'd1.read', label: 'D1 Read', category: 'developer-platform' },
      { scope: 'd1.write', label: 'D1 Write', category: 'developer-platform' },
      { scope: 'workers-r2.read', label: 'Workers R2 Read', category: 'developer-platform' },
      { scope: 'workers-r2.write', label: 'Workers R2 Write', category: 'developer-platform' },
      { scope: 'account-analytics.read', label: 'Account Analytics Read', category: 'analytics-logs' },
      { scope: 'pipelines.read', label: 'Pipelines Read', category: 'developer-platform' },
      { scope: 'r2-catalog.read', label: 'R2 Catalog Read', category: 'developer-platform' },
      { scope: 'r2-catalog-sql.read', label: 'R2 Catalog SQL Read', category: 'developer-platform' },
    ],
  };

  it('requires a host-owned permission catalog and uses its default packs', () => {
    assert.throws(
      () => requestedCloudflareScopes(),
      (error) => error.code === 'cloudflare_permission_registry_unavailable',
    );
    const scopes = requestedCloudflareScopes({ permissionCatalog });
    assert.deepEqual(scopes, [
      'offline_access',
      'account-settings.read',
      'workers-observability.read',
    ]);
  });

  it('derives permission products from the plugin-owned available-permissions catalog', () => {
    const cover = assertPermissionCatalogCoversAllScopes(permissionCatalog);
    assert.equal(cover.ok, true);
    assert.equal(cover.scopes, 8);
    assert.equal(cover.products, 6);
    const products = listCloudflarePermissionProducts(permissionCatalog);
    assert.deepEqual(
      products.find((product) => product.id === 'cloudflare.perm.d1').oauthScopes,
      ['d1.read', 'd1.write'],
    );
    assert.equal(products.some((product) => product.id === 'cloudflare.perm.workers-r2'), true);
  });

  it('upgrades scopes only for requested capabilities from the injected catalog', () => {
    const scopes = scopesForCapabilities({
      permissionCatalog,
      capabilities: ['cloudflare.url_scanner', 'cloudflare.workflows', 'cloudflare.pages', 'cloudflare.keyless_ssl'],
    });
    assert.ok(scopes.includes('url-scanner.write'));
    assert.ok(scopes.includes('workers-scripts.write'));
    assert.ok(scopes.includes('page.write'));
    assert.ok(!scopes.includes('ssl-and-certificates.write'));
  });

  it('requests only read-only Analytics and Basin scopes for the Health dashboard', () => {
    const scopes = requestedCloudflareScopes({
      permissionCatalog,
      capabilities: ['cloudflare.analytics', 'cloudflare.basin.read'],
    });
    assert.deepEqual(
      [...scopes].sort(),
      [
        'offline_access',
        'account-settings.read',
        'account-analytics.read',
        'pipelines.read',
        'r2-catalog.read',
        'r2-catalog-sql.read',
      ].sort(),
    );
    assert.ok(!scopes.some((scope) => /write|send/i.test(scope)));
    assert.deepEqual(
      getCloudflareCapability('cloudflare.basin.read', permissionCatalog).oauthScopes,
      ['pipelines.read', 'r2-catalog.read', 'r2-catalog-sql.read'],
    );
  });

  it('resolves Images scopes from the OAuth catalog, not package constants', () => {
    const cap = getCloudflareCapability('cloudflare.images', permissionCatalog);
    assert.deepEqual(cap.oauthScopes, ['images.read', 'images.write']);
  });

  it('does not invent a Snippets OAuth scope', () => {
    const cap = getCloudflareCapability('cloudflare.snippets');
    assert.deepEqual(cap.oauthScopes, []);
    assert.equal(cap.tokenRequired, true);
  });

  it('never interprets a token-only Cloudflare product as OAuth authorized', () => {
    const status = assessCapabilityAuthorization('cloudflare.snippets', ['account-settings.read']);
    assert.equal(status.status, 'unknown');
    assert.equal(status.token_required, true);
    assert.equal(status.probe_required, true);
    assert.deepEqual(status.missing_scopes, []);
  });

  it('marks URL Scanner as needs_authorization when plugin-owned scopes are missing', () => {
    const status = assessCapabilityAuthorization(
      'cloudflare.url_scanner',
      ['account-settings.read'],
      permissionCatalog,
    );
    assert.equal(status.status, 'needs_authorization');
    assert.ok(status.missing_scopes.includes('url-scanner.write'));
    assert.match(status.permissionLabel, /URL Scanner/);
  });

  it('treats Keyless as an enterprise add-on, not a default setup grant', () => {
    const cap = getCloudflareCapability('cloudflare.keyless_ssl', permissionCatalog);
    assert.equal(cap.availability, 'enterprise_addon');
    assert.match(cap.availabilityNote, /Enterprise/);
  });
});

describe('credential authority', () => {
  it('does not use CLOUDFLARE_IMAGES_API_TOKEN as generic API auth', () => {
    const auth = resolveCloudflareApiAuth({
      CLOUDFLARE_IMAGES_API_TOKEN: 'images-only-secret',
      CLOUDFLARE_ACCOUNT_ID: 'acct',
    });
    assert.equal(auth.configured, false);
    assert.equal(auth.apiToken, '');
  });

  it('Images-specific token only resolves for cloudflare.images capability', async () => {
    const generic = await resolveCloudflareCredential({
      env: { CLOUDFLARE_IMAGES_API_TOKEN: 'images-only', CLOUDFLARE_ACCOUNT_ID: 'acct' },
      authMode: 'token',
      capabilityId: 'cloudflare.workflows',
    });
    assert.equal(generic.bearerToken, null);

    const images = await resolveCloudflareCredential({
      env: { CLOUDFLARE_IMAGES_API_TOKEN: 'images-only', CLOUDFLARE_ACCOUNT_ID: 'acct' },
      authMode: 'token',
      capabilityId: 'cloudflare.images',
    });
    assert.equal(images.bearerToken, 'images-only');
    assert.equal(images.source, 'images_api_token');
  });

  it('prefers CLOUDFLARE_API_TOKEN for generic operations', async () => {
    const cred = await resolveCloudflareCredential({
      env: {
        CLOUDFLARE_API_TOKEN: 'general',
        CLOUDFLARE_IMAGES_API_TOKEN: 'images-only',
        CLOUDFLARE_ACCOUNT_ID: 'acct',
      },
      authMode: 'token',
    });
    assert.equal(cred.bearerToken, 'general');
    assert.equal(cred.source, 'api_token');
  });

  it('loads oauth from user_oauth_tokens via encrypted access token', async () => {
    const env = {
      DB: {
        prepare() {
          return {
            bind() { return this; },
            async first() {
              return {
                id: 42,
                account_id: 'au_test',
                provider: 'cloudflare',
                account_identifier: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                access_token_encrypted: 'sealed-by-host',
                scopes: 'account-settings.read page.read',
                is_active: 1,
              };
            },
          };
        },
      },
    };
    const cred = await resolveCloudflareCredential({
      env,
      ownerId: 'au_test',
      authMode: 'oauth',
      decryptUserOauthToken: async () => 'oauth-bearer',
    });
    assert.equal(cred.source, 'oauth_connection');
    assert.equal(cred.bearerToken, 'oauth-bearer');
    assert.equal(cred.accountId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.ok(cred.grantedScopes.includes('page.read'));
  });
});

describe('cloudflare API families (mocked)', () => {
  it('workflows.list hits real Cloudflare path', async () => {
    const calls = [];
    const client = new CloudflareApiClient({
      apiToken: 'test-token',
      accountId: 'acct_test',
      fetchImpl: async (url, init) => {
        calls.push({ url, method: init.method, auth: init.headers.Authorization });
        return {
          ok: true,
          status: 200,
          headers: new Map(),
          text: async () => JSON.stringify({
            success: true,
            result: [{ name: 'site-release', id: 'wf1' }],
            result_info: { count: 1 },
          }),
        };
      },
    });
    const result = await workflows.workflowsList(client);
    assert.equal(result.ok, true);
    assert.equal(result.workflows[0].name, 'site-release');
    assert.match(calls[0].url, /\/accounts\/acct_test\/workflows/);
    assert.equal(calls[0].auth, 'Bearer test-token');
  });

  it('pages.list hits /pages/projects', async () => {
    const client = new CloudflareApiClient({
      apiToken: 'tok',
      accountId: 'acct',
      fetchImpl: async (url) => {
        assert.match(url, /\/pages\/projects/);
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json', [Symbol.iterator]: function* () {} },
          text: async () => JSON.stringify({ success: true, result: [{ name: 'demo' }] }),
        };
      },
    });
    const result = await pages.pagesList(client);
    assert.equal(result.projects[0].name, 'demo');
  });

  it('snippet rules reconcile preserves foreign rules', () => {
    const plan = snippets.reconcileSnippetRules(
      [
        { description: 'Customer hand rule', expression: 'true', enabled: true },
        { description: '[AgentSam] old', expression: 'http.request.uri.path eq "/x"', enabled: true },
      ],
      [{ description: 'canonical host', snippet: 'canonical-host', expression: 'true', enabled: true }],
    );
    assert.equal(plan.foreign_preserved, 1);
    assert.equal(plan.agentsam_rules, 1);
    assert.equal(plan.next_count, 2);
    assert.ok(plan.rules[1].description.startsWith('[AgentSam]'));
    assert.equal(plan.rules[0].description, 'Customer hand rule');
  });

  it('scanner.scan posts to urlscanner/v2/scan', async () => {
    const client = new CloudflareApiClient({
      apiToken: 'tok',
      accountId: 'acct',
      fetchImpl: async (url, init) => {
        assert.match(url, /\/urlscanner\/v2\/scan$/);
        assert.equal(init.method, 'POST');
        const body = JSON.parse(init.body);
        assert.equal(body.url, 'https://example.com');
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json', [Symbol.iterator]: function* () {} },
          text: async () => JSON.stringify({ success: true, result: { uuid: 'scan-1' } }),
        };
      },
    });
    const result = await scanner.scannerScan(client, 'https://example.com');
    assert.equal(result.scan.uuid, 'scan-1');
  });

  it('403 returns permission remediation, not raw dump only', async () => {
    const client = new CloudflareApiClient({
      apiToken: 'tok',
      accountId: 'acct',
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        headers: { get: () => 'application/json', [Symbol.iterator]: function* () {} },
        text: async () => JSON.stringify({
          success: false,
          errors: [{ message: 'Authentication error' }],
        }),
      }),
    });
    await assert.rejects(
      () => scanner.scannerScan(client, 'https://example.com'),
      (err) => {
        assert.equal(err.code, 'cloudflare_permission_denied');
        assert.equal(err.remediation.capability_id, 'cloudflare.url_scanner');
        assert.match(err.remediation.permission_required, /URL Scanner/);
        return true;
      },
    );
  });

  it('keyless status without zone stays advanced / non-mutating', async () => {
    const client = new CloudflareApiClient({ apiToken: 'tok', accountId: 'acct' });
    const result = await keyless.keylessStatus(client, null);
    assert.equal(result.availability, 'enterprise_addon');
    assert.equal(result.ok, false);
    assert.match(result.learn, /Keyless/);
  });

  it('keyless rejects private key in create body', async () => {
    const client = new CloudflareApiClient({ apiToken: 'tok', accountId: 'acct' });
    await assert.rejects(
      () => keyless.keylessCreate(client, 'zone1', { private_key: 'SECRET' }),
      /private key must not be sent/i,
    );
  });
});
