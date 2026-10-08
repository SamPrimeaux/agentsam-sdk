import test from 'node:test';
import assert from 'node:assert/strict';
import { runNodeApiRemote } from '../../src/commands/autorag-node-api.js';

const endpoint = 'https://my-project.supabase.co/functions/v1/node-api';
const config = {
  repository_id: 'customer-repo-one',
  scope: { name: 'any-scope', include: ['.'], exclude: [] },
  chunking: { max_chars: 4000 },
  embedding: { provider: 'gemini', model: 'gemini-embedding-2', dimensions: 1536 },
  lane: { id: 'one', backend: 'supabase_pgvector', resource: endpoint },
};
const requests = [];
function fetchMock(url, opts) {
  const u = new URL(url);
  requests.push({ path: u.pathname, method: opts.method, params: Object.fromEntries(u.searchParams), body: opts.body && JSON.parse(opts.body), auth: opts.headers['x-agentsam-bridge-key'] });
  if (u.pathname.endsWith('/health')) return Promise.resolve(Response.json({ ok: true, version: '0.8.0' }));
  if (u.pathname.endsWith('/capabilities')) return Promise.resolve(Response.json({ ok: true, embedding: { default_model: 'gemini-embedding-2', default_dimensions: 1536, max_batch_size: 100 } }));
  if (u.pathname.endsWith('/codebase/status')) return Promise.resolve(Response.json({ ok: true, row_count: 10 }));
  if (u.pathname.endsWith('/codebase/ingest') || u.pathname.endsWith('/vectors/ingest')) return Promise.resolve(Response.json({ ok: true, processed: JSON.parse(opts.body).items.length, skipped: 0, failed: 0, job_id: 'job-test' }));
  if (u.pathname.endsWith('/vectors/query')) return Promise.resolve(Response.json({ ok: true, corpus: 'codebase', result_count: 1, results: [{ file_path: 'anywhere/one.ts' }] }));
  return Promise.resolve(Response.json({ ok: false, error: 'unknown' }, { status: 404 }));
}

test('public capability discovery never claims remote generation readiness', async () => {
  requests.length = 0;
  const out = await runNodeApiRemote({ opts: {}, config, env: {}, fetchImpl: fetchMock });
  assert.equal(out.accessible, true);
  assert.equal(out.configured, true);
  assert.equal(out.connected, false);
  assert.equal(out.ready, false);
  assert.equal(out.embedding.dimensions, 1536);
  assert.ok(requests.every(x => !x.auth));
});

test('authorized remote query uses caller identity and emits real result envelope', async () => {
  requests.length = 0;
  const out = await runNodeApiRemote({ opts: { query: 'how do I find the importer?', 'account-id': 'acct-b', 'repository-id': 'repo-b', 'allow-paid': true }, config, env: { AGENTSAM_BRIDGE_KEY: 'fixture-bridge' }, fetchImpl: fetchMock });
  assert.equal(out.result_count, 1);
  assert.equal(out.repository, 'repo-b');
  const call = requests.find(x => x.path.endsWith('/vectors/query'));
  assert.equal(call.params.account_id, 'acct-b');
  assert.equal(call.params.repository_id, 'repo-b');
  assert.equal(call.auth, 'fixture-bridge');
});

test('publishing a current arbitrary source-scope generation calls remote Gemini embedding ingestion', async () => {
  requests.length = 0;
  const generation = { id: 'any-generation', source_hash: 'source-sha', git: { commit: 'commit-1' },
    config, chunks: [{ id: 'chunk-one', path: 'different-root/file.ts', ordinal: 0, content: 'function test() {}', content_hash: 'chunk-sha', line_start: 1, line_end: 1 }] };
  const store = { active: async () => generation, close: async () => undefined };
  const out = await runNodeApiRemote({ opts: { publish: true, 'allow-paid': true, 'account-id': 'user1234' }, config, root: '/unused', openStore: async () => store, env: { AGENTSAM_BRIDGE_KEY: 'fixture-bridge' }, fetchImpl: fetchMock });
  assert.equal(out.submitted_chunks, 1);
  assert.equal(out.processed, 1);
  assert.equal(out.batch_verified, true);
  assert.equal(out.generation_verified, false);
  const sent = requests.find(x => x.path.endsWith('/codebase/ingest')).body;
  assert.equal(sent.index_generation_id, 'any-generation');
  assert.equal(sent.repository_id, 'customer-repo-one');
  assert.equal(sent.account_id, 'user1234');
  assert.equal(sent.embedding.dimensions, 1536);
  assert.equal(sent.items[0].file_path, 'different-root/file.ts');
});

test('source scope drift and paid execution without approval are rejected before remote writes', async () => {
  requests.length = 0;
  const stale = { id: 'old', config: { ...config, scope: { name: 'any-scope', include: ['src'], exclude: [] } }, chunks: [{ id: '1', path: 'src/a.ts', content: 'x' }] };
  const openStore = async () => ({ active: async () => stale, close: async () => undefined });
  await assert.rejects(runNodeApiRemote({ opts: { publish: true, 'account-id': 'a', 'allow-paid': true }, config, root: '/unused', openStore, env: { AGENTSAM_BRIDGE_KEY: 'fixture-bridge' }, fetchImpl: fetchMock }), /config_mismatch/);
  await assert.rejects(runNodeApiRemote({ opts: { query: 'something', 'account-id': 'a' }, config, env: { AGENTSAM_BRIDGE_KEY: 'fixture-bridge' }, fetchImpl: fetchMock }), /requires_allow_paid/);
  assert.equal(requests.filter(x => x.method === 'POST').length, 0);
});

test('documents use a repository-scoped source selector rather than mixing customer corpora', async () => {
  requests.length = 0;
  const generation = { id: 'doc-gen', source_hash: 'source-hash', config, chunks: [
    { id: 'docchunk', path: 'notes/release.md', content: 'A release note for this customer', ordinal: 0, content_hash: 'hash' },
  ] };
  const store = { active: async () => generation, close: async () => undefined };
  await runNodeApiRemote({ opts: { publish: true, corpus: 'documents', 'account-id': 'tenant-one', 'allow-paid': true }, config, root: '/unused', openStore: async () => store, env: { AGENTSAM_BRIDGE_KEY: 'fixture-bridge' }, fetchImpl: fetchMock });
  const sent = requests.find(x => x.path.endsWith('/vectors/ingest')).body;
  assert.equal(sent.items[0].source_type, 'repository:customer-repo-one');
  assert.equal(sent.items[0].source_path, 'notes/release.md');
  requests.length = 0;
  await runNodeApiRemote({ opts: { query: 'release note', corpus: 'documents', 'account-id': 'tenant-one', 'allow-paid': true }, config, env: { AGENTSAM_BRIDGE_KEY: 'fixture-bridge' }, fetchImpl: fetchMock });
  assert.equal(requests.find(x => x.path.endsWith('/vectors/query')).params.source_type, 'repository:customer-repo-one');
});

test('explicit embedding budget prevents accidental whole-repository backfill', async () => {
  requests.length = 0;
  const many = { id: 'big-generation', config, chunks: Array.from({ length: 101 }, (_, i) => ({ id: `${i}`, path: `src/${i}.ts`, content: 'chunk', ordinal: i })) };
  await assert.rejects(runNodeApiRemote({ opts: { publish: true, 'account-id': 'customer', 'allow-paid': true }, config, root: '/unused', openStore: async () => ({ active: async () => many, close: async () => {} }), env: { AGENTSAM_BRIDGE_KEY: 'fixture-bridge' }, fetchImpl: fetchMock }), /embedding_budget_exceeded/);
  assert.equal(requests.filter(x => x.method === 'POST').length, 0);
});
