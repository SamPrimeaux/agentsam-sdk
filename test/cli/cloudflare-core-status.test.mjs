import test from 'node:test';
import assert from 'node:assert/strict';
import { probeCloudflareCore } from '../../src/commands/cloudflare.js';

test('live API-token status verifies only successful read operations', async () => {
  const paths = [];
  const client = {
    apiToken: 'fixture-token', accountId: 'test-account',
    accountPath: (suffix) => '/accounts/test-account/' + suffix,
    async request(method, path, options) {
      paths.push({ method, path, capability: options.capabilityId });
      if (path.includes('/r2/')) {
        const err = new Error('forbidden'); err.httpStatus = 403; err.code = 'cloudflare_permission_denied';
        throw err;
      }
      if (path.includes('/vectorize/')) {
        const err = new Error('network failed'); err.code = 'cloudflare_network_error';
        throw err;
      }
      return { http_status: 200 };
    },
  };
  const result = await probeCloudflareCore(client);
  assert.equal(paths.length, 3);
  assert.ok(paths.every(x => x.method === 'GET'));
  assert.equal(result['cloudflare.d1'].status, 'authorized');
  assert.equal(result['cloudflare.d1'].operation, 'read');
  assert.equal(result['cloudflare.r2'].status, 'needs_authorization');
  assert.equal(result['cloudflare.vectorize'].status, 'unknown');
  assert.equal(result['cloudflare.vectorize'].verified, false);
});

test('core status never probes without a configured token and account', async () => {
  const request = () => { throw new Error('should not call network'); };
  assert.deepEqual(await probeCloudflareCore({ apiToken: '', accountId: 'abc', request }), {});
  assert.deepEqual(await probeCloudflareCore({ apiToken: 'xyz', accountId: '', request }), {});
});

test('Cloudflare CLI status combines verified D1 probe with unknown write scopes', async () => {
  const { runCloudflare } = await import('../../src/commands/cloudflare.js');
  let output = '';
  const fetchImpl = async (url) => {
    const pathname = new URL(url).pathname;
    const denied = pathname.includes('/r2/buckets');
    return new Response(JSON.stringify({
      success: !denied,
      result: denied ? null : [],
      errors: denied ? [{code:10000,message:'missing permission'}] : [],
    }), {status:denied ? 403 : 200,headers:{'content-type':'application/json'}});
  };
  const result = await runCloudflare(['status','--json'], {
    apiToken:'fixture-token',accountId:'account-fixture',fetchImpl,
    write:v=>{output+=v;},
  });
  const parsed=JSON.parse(output);
  assert.equal(result.auth.mode,'api_token');
  assert.equal(parsed.probes['cloudflare.d1'].verified,true);
  assert.equal(parsed.probes['cloudflare.r2'].status,'needs_authorization');
  assert.equal(parsed.capabilities.find(c=>c.capability_id==='cloudflare.d1').status,'unknown');
  assert.equal(parsed.capabilities.find(c=>c.capability_id==='cloudflare.r2').status,'unknown');
  assert.ok(parsed.note.includes('scope matrix unknown'));
});
