import test from 'node:test';
import assert from 'node:assert/strict';
import { handleKnowledgeNodeApiRequest } from './knowledge-node-api.js';

const env = { AGENTSAM_NODE_API_URL: 'https://example.supabase.co/functions/v1/node-api', AGENTSAM_BRIDGE_KEY: 'worker-only-test-key' };
const path = 'https://studio.test/api/knowledge/node-api';
function fakeFetch(record, { auth = 200 } = {}) {
  return async (url, options) => {
    record.push({ url: String(url), headers: options.headers, method: options.method, body: options.body && JSON.parse(options.body) });
    if (auth !== 200) return Response.json({ ok: false, error: 'invalid_bridge_key' }, { status: auth });
    if (url.endsWith('/codebase/status')) return Response.json({ ok: true, row_count: 100, principal: null });
    if (String(url).includes('vectors/query')) return Response.json({ ok: true, corpus: 'codebase', result_count: 1, results: [{ file_path: 'src/a.ts' }] });
    if (String(url).endsWith('/codebase/ingest')) return Response.json({ ok: true, processed: 1, skipped: 0, failed: 0, job_id: 'test-job-id' });
    return Response.json({ ok: true, embedding: { default_model: 'gemini-embedding-2', default_dimensions: 1536 } });
  };
}
const req = (uri, method = 'GET', body, paid = false) => new Request(uri, {
  method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(paid ? { 'x-agentsam-paid-approved': 'true' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

test('gateway rejects missing session, even for public upstream health', async () => {
  const seen = [];
  const response = await handleKnowledgeNodeApiRequest(req(`${path}/health`), env, null, { fetchImpl: fakeFetch(seen) });
  assert.equal(response.status, 401);
  assert.deepEqual(seen, []);
});

test('protected status verifies the Worker-provided bridge key without returning its value', async () => {
  const seen = [];
  const response = await handleKnowledgeNodeApiRequest(req(`${path}/codebase/status`), env, 'session_account', { fetchImpl: fakeFetch(seen) });
  const body = await response.json();
  assert.equal(body.bridge_verified, true);
  assert.equal(body.scope, 'bridge_connection_only');
  assert.equal(seen[0].headers['x-agentsam-bridge-key'], env.AGENTSAM_BRIDGE_KEY);
  assert.equal(JSON.stringify(body).includes(env.AGENTSAM_BRIDGE_KEY), false);
  const rejected = await handleKnowledgeNodeApiRequest(req(`${path}/codebase/status`), env, 'session_account', { fetchImpl: fakeFetch([], { auth: 401 }) });
  assert.equal((await rejected.json()).error, 'node_api_bridge_auth_rejected');
});

test('gateway overrides attacker-selected account and caps paid, repository-scoped queries', async () => {
  const seen = [];
  const query = `${path}/vectors/query?q=read%20symbols&corpus=codebase&repository_id=my-repo&account_id=another-account&limit=50`;
  const before = await handleKnowledgeNodeApiRequest(req(query), env, 'real_session_account', { fetchImpl: fakeFetch(seen) });
  assert.equal(before.status, 403);
  assert.equal(seen.length, 0);
  const response = await handleKnowledgeNodeApiRequest(req(query, 'GET', null, true), env, 'real_session_account', { fetchImpl: fakeFetch(seen) });
  const sent = new URL(seen[0].url);
  assert.equal(response.status, 200);
  assert.equal(sent.searchParams.get('account_id'), 'real_session_account');
  assert.equal(sent.searchParams.get('repository_id'), 'my-repo');
  assert.equal(sent.searchParams.get('limit'), '8');
  assert.equal(sent.searchParams.get('q'), 'read symbols');
});

test('gateway forces generation, corpus and account identity on bounded codebase ingest', async () => {
  const seen = [];
  const payload = { account_id: 'another-person', repository_id: 'customer-repo', index_generation_id: 'real-generation',
    items: [{ id: 'chunk-id', file_path: 'src/example.ts', content: 'export const value = 1', node_type: 'code_chunk', node_name: 'value', metadata: { account_id: 'forged' } }],
  };
  const denied = await handleKnowledgeNodeApiRequest(req(`${path}/codebase/ingest`, 'POST', payload), env, 'real_account', { fetchImpl: fakeFetch(seen) });
  assert.equal(denied.status, 403);
  const response = await handleKnowledgeNodeApiRequest(req(`${path}/codebase/ingest`, 'POST', payload, true), env, 'real_account', { fetchImpl: fakeFetch(seen) });
  const sent = seen[0].body;
  assert.equal(response.status, 200);
  assert.equal(sent.account_id, 'real_account');
  assert.equal(sent.items[0].repository_id, 'customer-repo');
  assert.equal(sent.items[0].metadata.account_id, undefined);
  assert.equal((await response.json()).generation_activated, false);
});

test('document query uses repository-specific source_type because its RPC does not accept repository_id', async () => {
  const seen = [];
  await handleKnowledgeNodeApiRequest(req(`${path}/vectors/query?q=release&corpus=documents&repository_id=docs-repo`, 'GET', null, true), env, 'real_account', { fetchImpl: fakeFetch(seen) });
  const target = new URL(seen[0].url);
  assert.equal(target.searchParams.get('source_type'), 'repository:docs-repo');
  assert.equal(target.searchParams.has('repository_id'), false);
});
