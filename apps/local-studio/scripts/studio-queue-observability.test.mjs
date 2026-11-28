import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleStudioQueueObservability,
  normalizeQueueInventory,
} from '../backend/worker/studio-queue-observability.js';

const userId = 'user-123';
const credential = {
  status: 'ready', accountId: 'cloudflare-account',
  bearerToken: 'test-oauth-secret-never-to-client', grantedScopes: ['queues.read'],
};
const request = (path = '') => new Request('https://agentsam.test/api/queues/observability' + path);

function mockFetch(pathname, status = 200) {
  return async url => {
    const path = new URL(url).pathname;
    if (pathname && !path.includes(pathname)) throw new Error('unexpected URL ' + path);
    if (path.endsWith('/metrics')) return Response.json({
      success: true, result: { backlog_count: 0, backlog_bytes: 0, oldest_message_timestamp_ms: 0 },
    }, { status });
    if (path.endsWith('/consumers')) return Response.json({ success: true, result: [] });
    if (path.endsWith('/queues')) return Response.json({
      success: true, result: [{
        queue_id: 'queue_id_123', queue_name: 'media-queue',
        settings: { delivery_paused: false },
        producers: [{ type: 'worker', script: 'moviemode-service' }],
        consumers: [{ type: 'worker', script_name: 'media-consumer', dead_letter_queue: 'media-dlq' }],
      }],
    });
    throw Error('unexpected path: ' + path);
  };
}
const options = fetchImpl => ({
  fetchImpl,
  resolveCredential: async () => credential,
  loadPermissionCatalog: async () => ({provider:'cloudflare'}),
  assessAuthorization: () => ({status:'authorized'}),
});

test('missing session is rejected before resolving a Cloudflare credential', async () => {
  let resolved = false;
  const response = await handleStudioQueueObservability(request(),{},null,{
    resolveCredential:async()=>{resolved=true;return credential;},
  });
  assert.equal(response.status,401);
  assert.equal(resolved,false);
});

test('Cloudflare OAuth is required; environment API tokens are not a fallback', async () => {
  const response = await handleStudioQueueObservability(request(),{
    CLOUDFLARE_ACCOUNT_ID:'account',CLOUDFLARE_API_TOKEN:'must-not-be-used',
  },userId,{
    resolveCredential:async()=>({status:'authorization_required',error:'cloudflare_oauth_required'}),
  });
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'cloudflare_oauth_required');
});

test('account selection and missing queue permission have distinct actionable errors', async () => {
  const selection = await handleStudioQueueObservability(request(),{},userId,{
    resolveCredential:async()=>({status:'configuration_required',accounts:[{accountIdentifier:'cf-1',accountLabel:'Production'}]}),
  });
  assert.equal(selection.status,409);
  assert.equal((await selection.json()).error,'cloudflare_account_selection_required');
  const denied = await handleStudioQueueObservability(request(),{},userId,{
    resolveCredential:async()=>credential,
    loadPermissionCatalog:async()=>({}),
    assessAuthorization:()=>({status:'needs_authorization',missingScopes:['queues.read'],permissionLabel:'Account → Queues → Edit'}),
  });
  assert.equal(denied.status,403);
  assert.equal((await denied.json()).error,'cloudflare_permission_denied');
});

test('Cloudflare metrics preserve real zero and topology without leaking OAuth token', async () => {
  const env = {QUEUE_OBSERVABILITY_OWNERS_JSON:'{"media-queue":{"owner_app":"MovieMode","environment":"production"}}'};
  const response = await handleStudioQueueObservability(request(),env,userId,options(mockFetch()));
  assert.equal(response.status,200);
  const raw = await response.text();
  assert.ok(!raw.includes(credential.bearerToken));
  const data = JSON.parse(raw);
  assert.equal(data.source,'cloudflare-oauth');
  assert.equal(data.queues.length,1);
  assert.equal(data.queues[0].metrics.state,'ready');
  assert.equal(data.queues[0].metrics.backlog_count,0);
  assert.equal(data.queues[0].owner_app,'MovieMode');
  assert.equal(data.queues[0].consumers[0].dead_letter_queue,'media-dlq');
});

test('failed metric reads remain unavailable, never become a fabricated zero', async () => {
  const fetchImpl = async url => new URL(url).pathname.endsWith('/metrics')
    ? Response.json({ success: false, errors: [{ message: 'temporary failure' }] }, { status: 502 })
    : mockFetch()(url);
  const response = await handleStudioQueueObservability(request(),{},userId,{...options(fetchImpl)});
  const data = await response.json();
  assert.equal(data.queues[0].metrics.state,'unavailable');
  assert.equal(data.queues[0].metrics.backlog_count,null);
});

test('history access is scoped to queue IDs returned by inventory', async () => {
  const response = await handleStudioQueueObservability(
    request('?queue_id=does-not-exist&history=24h'),{},userId,options(mockFetch()),
  );
  assert.equal(response.status,404);
});

test('queue inventory does not infer owner or environment when unknown', () => {
  const result = normalizeQueueInventory({queue_id:'abc',queue_name:'unknown'},{
    state:'unavailable',backlog_count:null,
  });
  assert.equal(result.owner_app,null);
  assert.equal(result.environment,null);
  assert.deepEqual(result.producers,[]);
  assert.deepEqual(result.consumers,[]);
});
