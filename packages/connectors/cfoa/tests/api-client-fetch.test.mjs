import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bindFetchImpl, CloudflareApiClient } from '../src/api-client.js';

describe('CloudflareApiClient fetch binding', () => {
  it('binds globalThis.fetch for Workers-safe default invocation', () => {
    const bound = bindFetchImpl(globalThis.fetch);
    assert.equal(typeof bound, 'function');
    assert.notEqual(bound, globalThis.fetch);
  });

  it('invokes fetch as a free function from request() (no client this)', async () => {
    const seen = { thisValue: 'unset', url: '' };
    function strictFetch(url) {
      'use strict';
      seen.thisValue = this;
      seen.url = String(url);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        async text() {
          return JSON.stringify({ success: true, result: { id: 'acct' } });
        },
      };
    }

    const client = new CloudflareApiClient({
      apiToken: 'test-token',
      accountId: 'acct',
      fetchImpl: strictFetch,
    });
    // Regression for Workers: `this.fetchImpl(...)` would set this → CloudflareApiClient
    // and throw Illegal invocation on native fetch. Free-call must keep this undefined.
    const out = await client.request('GET', '/accounts/acct');
    assert.equal(out.ok, true);
    assert.equal(seen.url, 'https://api.cloudflare.com/client/v4/accounts/acct');
    assert.equal(seen.thisValue, undefined);
  });

  it('keeps /client/v4 for account-scoped media paths (regression: 7003 No route for that URI)', async () => {
    const urls = [];
    const client = new CloudflareApiClient({
      apiToken: 't',
      accountId: 'acct',
      fetchImpl: async (url) => {
        urls.push(String(url));
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          async text() { return JSON.stringify({ success: true, result: [] }); },
        };
      },
    });
    await client.request('GET', client.accountPath('/r2/buckets?per_page=1'));
    await client.request('GET', client.accountPath('/images/v2?per_page=1'));
    await client.request('GET', client.accountPath('/stream?limit=1'));
    await client.request('GET', 'accounts/acct/relative');
    assert.deepEqual(urls, [
      'https://api.cloudflare.com/client/v4/accounts/acct/r2/buckets?per_page=1',
      'https://api.cloudflare.com/client/v4/accounts/acct/images/v2?per_page=1',
      'https://api.cloudflare.com/client/v4/accounts/acct/stream?limit=1',
      'https://api.cloudflare.com/client/v4/accounts/acct/relative',
    ]);
  });

  it('rejects a non-function fetchImpl early', () => {
    assert.throws(() => bindFetchImpl(null), /cloudflare_fetch_required/);
  });
});
