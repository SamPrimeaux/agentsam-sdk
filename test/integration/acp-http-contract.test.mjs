import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpAgentControlClient } from '../../src/acp/client.js';
import { createAgentControlHttpHandler } from '../../src/acp/http.js';

function fixture() {
  const calls = [];
  const control = {
    async start(input) {
      calls.push(['start', input]);
      return { schema: 'agentsam.run-start.v1', run_id: 'arun_root', status: 'queued' };
    },
    async getRun(id) {
      calls.push(['get', id]);
      return id === 'missing' ? null : { schema: 'agentsam.run.v1', id, status: 'running' };
    },
    async events(id, query) {
      calls.push(['events', id, query]);
      return [{ id: 'evt_1', runId: id, seq: query.after + 1, eventType: 'run.started' }];
    },
    async tree(id) {
      calls.push(['tree', id]);
      return { id, status: 'running', children: [] };
    },
    async spawn(id, input) {
      calls.push(['spawn', id, input]);
      return { schema: 'agentsam.child-run-spawn.v1', parent_run_id: id, child_run_id: 'arun_child' };
    },
    async cancel(id) {
      calls.push(['cancel', id]);
      return { id, status: 'running', cancelRequested: true };
    },
    async receipt(id) {
      calls.push(['receipt', id]);
      return { schema: 'agentsam.run-receipt.v1', runId: id, status: 'running' };
    },
  };
  const handler = createAgentControlHttpHandler({ control, service: 'test-acp' });
  const fetchImpl = (url, init = {}) => handler(new Request(url, init));
  return { calls, control, handler, fetchImpl };
}

test('portable HTTP handler is wire-compatible with HttpAgentControlClient across run lifecycle routes', async () => {
  const fx = fixture();
  const client = new HttpAgentControlClient({
    baseUrl: 'https://acp.example.test',
    token: 'test-token',
    fetchImpl: fx.fetchImpl,
  });

  const started = await client.start({
    objective: 'Coordinate a portable run',
    runtime_requirements: { capabilities: ['exec'] },
  });
  assert.equal(started.run_id, 'arun_root');

  assert.equal((await client.getRun('arun_root')).id, 'arun_root');
  assert.equal((await client.events('arun_root', { after: 7, limit: 9 }))[0].seq, 8);
  assert.equal((await client.tree('arun_root')).id, 'arun_root');
  assert.equal((await client.spawn('arun_root', { objective: 'child work' })).child_run_id, 'arun_child');
  assert.equal((await client.cancel('arun_root')).cancelRequested, true);
  assert.equal((await client.receipt('arun_root')).runId, 'arun_root');

  assert.deepEqual(fx.calls.map((call) => call[0]), [
    'start', 'get', 'events', 'tree', 'spawn', 'cancel', 'receipt',
  ]);
  assert.deepEqual(fx.calls[2][2], { after: 7, limit: 9 });
});

test('portable HTTP handler exposes health, method errors, missing runs, and pluggable authorization', async () => {
  const fx = fixture();
  const guarded = createAgentControlHttpHandler({
    control: fx.control,
    authorize: (request) => request.headers.get('authorization') === 'Bearer good-token'
      ? { ok: true }
      : { ok: false, code: 'unauthorized', status: 401 },
  });

  const denied = await guarded(new Request('https://acp.example.test/v1/runs/arun_root'));
  assert.equal(denied.status, 401);

  const health = await guarded(new Request('https://acp.example.test/health', {
    headers: { authorization: 'Bearer good-token' },
  }));
  assert.equal(health.status, 200);
  assert.equal((await health.json()).protocol, 'agentsam.control.v1');

  const method = await guarded(new Request('https://acp.example.test/v1/runs/arun_root', {
    method: 'POST',
    headers: { authorization: 'Bearer good-token' },
  }));
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'GET');

  const missing = await guarded(new Request('https://acp.example.test/v1/runs/missing', {
    headers: { authorization: 'Bearer good-token' },
  }));
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'run_not_found');
});

test('same ACP HTTP handler can be hosted by any Fetch-compatible provider adapter', async () => {
  const fx = fixture();

  for (const provider of ['cloudflare', 'gcp', 'docker', 'vm', 'local-node']) {
    const request = new Request('https://' + provider + '.example.test/v1/runs', {
      method: 'POST',
      body: JSON.stringify({
        objective: 'provider-neutral ' + provider,
        runtime_requirements: { provider },
      }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await fx.handler(request, { provider });
    assert.equal(response.status, 202, provider);
    assert.equal((await response.json()).schema, 'agentsam.run-start.v1', provider);
  }
});
