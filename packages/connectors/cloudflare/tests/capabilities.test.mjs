import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  requestedCloudflareScopes,
  CLOUDFLARE_ALL_SCOPES,
  CLOUDFLARE_BASELINE_SCOPES,
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
  it('does not request the full scope catalog by default', () => {
    const scopes = requestedCloudflareScopes();
    assert.ok(scopes.length < 20);
    assert.ok(scopes.length >= CLOUDFLARE_BASELINE_SCOPES.length);
    assert.deepEqual(scopes.sort(), [...CLOUDFLARE_BASELINE_SCOPES].sort());
    assert.ok(!scopes.includes('url-scanner.write'));
    assert.equal(CLOUDFLARE_ALL_SCOPES.length > 100, true);
  });

  it('upgrades scopes only for requested capabilities', () => {
    const scopes = scopesForCapabilities({
      capabilities: ['cloudflare.url_scanner', 'cloudflare.workflows', 'cloudflare.pages'],
    });
    assert.ok(scopes.includes('url-scanner.write'));
    assert.ok(scopes.includes('workers-scripts.write'));
    assert.ok(scopes.includes('page.write'));
    assert.ok(!scopes.includes('ssl-and-certificates.write'));
  });

  it('uses images.read/write from OAuth catalog', () => {
    const cap = getCloudflareCapability('cloudflare.images');
    assert.deepEqual(cap.oauthScopes, ['images.read', 'images.write']);
  });

  it('does not invent snippets OAuth scope', () => {
    const cap = getCloudflareCapability('cloudflare.snippets');
    assert.equal(cap.oauthScopes.length, 0);
    assert.equal(cap.tokenRequired, true);
  });

  it('marks URL Scanner as needs_authorization when scopes missing', () => {
    const a = assessCapabilityAuthorization('cloudflare.url_scanner', ['account-settings.read']);
    assert.equal(a.status, 'needs_authorization');
    assert.ok(a.missing_scopes.includes('url-scanner.write'));
    assert.match(a.permissionLabel, /URL Scanner/);
  });

  it('treats Keyless as enterprise add-on (not default setup)', () => {
    const cap = getCloudflareCapability('cloudflare.keyless_ssl');
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

  it('loads oauth from user_oauth_tokens when plaintext access_token present', async () => {
    const env = {
      DB: {
        prepare() {
          return {
            bind() { return this; },
            async first() {
              return {
                id: 42,
                user_id: 'au_test',
                provider: 'cloudflare',
                account_identifier: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                access_token: 'oauth-bearer',
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
