import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseNodeApiClient, nodeApiEndpoint } from '../src/backends/supabase-node-api.js';

const endpoint = 'https://tenant-example.supabase.co/functions/v1/node-api';
const capabilities = { ok: true, embedding: { default_model: 'gemini-embedding-2', default_dimensions: 1536, max_batch_size: 100 } };
function fixture(responseLog) {
  return async (url, opts) => {
    const u = new URL(url);
    responseLog.push({ path: u.pathname, params: Object.fromEntries(u.searchParams), method: opts.method,
      authenticated: opts.headers['x-agentsam-bridge-key'] === 'test-only-key', body: opts.body && JSON.parse(opts.body) });
    if (u.pathname.endsWith('/health')) return Response.json({ ok: true, version: '0.8.0' });
    if (u.pathname.endsWith('/capabilities')) return Response.json(capabilities);
    if (u.pathname.endsWith('/vectors/query')) return Response.json({ ok: true, corpus: 'codebase', result_count: 1, results: [{ file_path: 'lib/example.ts', score: 0.9 }] });
    if (u.pathname.endsWith('/codebase/ingest')) return Response.json({ ok: true, processed: JSON.parse(opts.body).items.length, skipped: 0, failed: 0, job_id: 'test-job' });
    return Response.json({ ok: false, error: 'unexpected_endpoint' }, { status: 404 });
  };
}

test('transport discovers live-style capabilities without a bridge key, but protected search fails closed', async () => {
  const requests = [];
  const client = createSupabaseNodeApiClient({ endpoint, fetchImpl: fixture(requests) });
  assert.equal((await client.health()).version, '0.8.0');
  assert.equal((await client.capabilities()).embedding.default_dimensions, 1536);
  await assert.rejects(client.query({ accountId: 'customerA', query: 'how does this work?' }), /authorized_host_required/);
  assert.equal(requests.length, 2);
});

test('query preserves caller-selected account, repository, and corpus with server-only auth', async () => {
  const requests = [];
  const client = createSupabaseNodeApiClient({ endpoint, bridgeKey: 'test-only-key', fetchImpl: fixture(requests) });
  const receipt = await client.query({ accountId: 'customerB', repositoryId: 'other-repo', query: 'symbol resolution', corpus: 'codebase', limit: 4 });
  assert.equal(receipt.results[0].file_path, 'lib/example.ts');
  assert.equal(requests[0].params.account_id, 'customerB');
  assert.equal(requests[0].params.repository_id, 'other-repo');
  assert.equal(requests[0].params.q, 'symbol resolution');
  assert.equal(requests[0].authenticated, true);
  assert.throws(() => client.query({ query: 'test' }), /account_required/);
});

test('remote ingestion uses discovered 1536d Gemini contract, batches, and generation identity', async () => {
  const requests = [];
  const client = createSupabaseNodeApiClient({ endpoint, bridgeKey: 'test-only-key', fetchImpl: fixture(requests) });
  const items = Array.from({ length: 101 }, (_, i) => ({ id: String(i), content: `item ${i}`, file_path: `src/${i}.ts`, node_type: 'code_chunk', node_name: `chunk${i}` }));
  const done = await client.ingest({ accountId: 'random-user', repositoryId: 'repo-xyz', generationId: 'gen_17', items });
  assert.equal(done.batches, 2);
  assert.equal(done.processed, 101);
  assert.equal(done.embedding.default_dimensions, 1536);
  const bodies = requests.filter(x => x.method === 'POST').map(x => x.body);
  assert.deepEqual(bodies.map(x => x.items.length), [100, 1]);
  assert.ok(bodies.every(x => x.account_id === 'random-user' && x.repository_id === 'repo-xyz' && x.index_generation_id === 'gen_17'));
  await assert.rejects(client.ingest({ accountId: 'random-user', repositoryId: 'repo-xyz', generationId: 'gen_17', items, embedding: { dimensions: 768 } }), /dimensions_mismatch/);
});

test('endpoint disallows nonlocal plaintext transports and embedded credentials', () => {
  assert.throws(() => nodeApiEndpoint({ endpoint: 'http://other.example/edge' }), /https_required/);
  assert.throws(() => nodeApiEndpoint({ endpoint: 'https://username:password@other.example/edge' }), /endpoint_invalid/);
  assert.equal(nodeApiEndpoint({ projectRef: 'my-project' }), 'https://my-project.supabase.co/functions/v1/node-api');
});
