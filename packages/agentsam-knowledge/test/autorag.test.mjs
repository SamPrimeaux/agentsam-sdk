import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { createFixtureProvider, createOllamaProvider, createProviderRegistry, createBackendRegistry, discoverAutoRag, recommendAutoRag, safeAutoRagConfig, selectIntentRoute, routeCompanyQuestion } from '../src/index.js';


test('discovery canonicalizes GitHub repository identity and reports SDK repository intelligence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-autorag-discovery-'));
  try {
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:Example/Widget.git'], { cwd: root });
    const discovery = await discoverAutoRag({ root, env: {} });
    assert.equal(discovery.repository.identity, 'github:example/widget');
    assert.equal(discovery.capabilities.repository_intelligence, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('provider registry is explicit, deterministic, and fails closed', async () => {
  const registry = createProviderRegistry({ fixture: { dimensions: 3 }, gemini: { apiKey: null }, openai: { apiKey: null } });
  assert.deepEqual(registry.ids(), ['fixture', 'gemini', 'openai', 'workers-ai', 'ollama']);
  const fixture = createFixtureProvider({ dimensions: 3 });
  const profile = { provider: 'fixture', model: 'deterministic', dimensions: 3 };
  assert.equal((await fixture.embedQuery('hello', profile)).length, 3);
  assert.throws(() => registry.get('not-a-provider'), /provider_unsupported/);
  assert.equal((await registry.capabilities()).find(item => item.id === 'gemini').operational, false);
});

test('Ollama provider normalizes bind hosts before issuing embed requests', async () => {
  let seenUrl = null;
  const provider = createOllamaProvider({
    endpoint: '0.0.0.0:11434',
    fetchImpl: async (url) => {
      seenUrl = String(url);
      return new Response(JSON.stringify({ embeddings: [[1, 2, 3]] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const vector = await provider.embedQuery('hello', {
    provider: 'ollama',
    model: 'mxbai-embed-large',
    dimensions: 3,
  });
  assert.deepEqual(vector, [1, 2, 3]);
  assert.equal(seenUrl, 'http://127.0.0.1:11434/api/embed');
});

test('backend registry requires explicit resources and dimensions', () => {
  const registry = createBackendRegistry();
  assert.deepEqual(registry.get('local_exact').prepare({ backend: 'local_exact', dimensions: 3 }), { id: 'local_exact', dimensions: 3 });
  assert.throws(() => registry.get('cloudflare_vectorize').prepare({ backend: 'cloudflare_vectorize', dimensions: 3 }), /binding_required/);
  assert.throws(() => registry.get('unknown'), /backend_unsupported/);
});

test('Cloudflare Vectorize backend executes through Worker binding and user API transports', async () => {
  const backend = createBackendRegistry().get('cloudflare_vectorize');
  const profile = { backend: 'cloudflare_vectorize', dimensions: 3, binding: 'MY_VECTORS', index: 'customer-code-index' };
  assert.deepEqual(backend.prepare(profile), { id: 'cloudflare_vectorize', dimensions: 3, binding: 'MY_VECTORS', index: 'customer-code-index' });

  const workerCalls = [];
  const workerBinding = {
    async upsert(records) { workerCalls.push(['upsert', records]); return { mutationId: 'm1' }; },
    async query(vector, options) { workerCalls.push(['query', vector, options]); return { matches: [{ id: 'one', score: 0.9 }] }; },
    async deleteByIds(ids) { workerCalls.push(['delete', ids]); return { mutationId: 'm2' }; },
    async getByIds(ids) { workerCalls.push(['get', ids]); return ids.map(id => ({ id })); },
  };
  const workerContext = { binding: 'MY_VECTORS', index: 'customer-code-index', env: { MY_VECTORS: workerBinding } };
  assert.equal((await backend.upsert([{ id: 'one', vector: [1, 0, 0], metadata: { path: 'apps/a.js' } }], workerContext)).transport, 'worker_binding');
  assert.equal((await backend.query([1, 0, 0], { topK: 3 }, workerContext)).transport, 'worker_binding');
  assert.equal((await backend.delete(['one'], workerContext)).transport, 'worker_binding');
  assert.equal((await backend.verify(['one'], workerContext)).verified, true);
  assert.deepEqual(workerCalls.map(row => row[0]), ['upsert', 'query', 'delete', 'get']);

  const apiCalls = [];
  const apiClient = {
    accountPath(suffix) { return `/accounts/acct${suffix}`; },
    async request(method, requestPath, options) {
      apiCalls.push({ method, requestPath, options });
      if (requestPath.endsWith('/get_by_ids')) return { result: [{ id: 'one' }], auth: { source: 'fixture' } };
      return { result: { ok: true }, auth: { source: 'fixture' } };
    },
  };
  const apiContext = { binding: 'MY_VECTORS', index: 'customer-code-index', apiClient };
  assert.equal((await backend.upsert([{ id: 'one', vector: [1, 0, 0] }], apiContext)).transport, 'cloudflare_api');
  assert.equal((await backend.query([1, 0, 0], { topK: 2 }, apiContext)).transport, 'cloudflare_api');
  assert.equal((await backend.delete(['one'], apiContext)).transport, 'cloudflare_api');
  assert.equal((await backend.verify(['one'], apiContext)).verified, true);
  assert.equal(apiCalls[0].requestPath, '/accounts/acct/vectorize/v2/indexes/customer-code-index/upsert');
  assert.equal(apiCalls[0].options.headers['Content-Type'], 'application/x-ndjson');
  assert.match(apiCalls[0].options.body, /\"id\":\"one\"/);
  assert.equal(apiCalls[1].requestPath, '/accounts/acct/vectorize/v2/indexes/customer-code-index/query');
  assert.equal(apiCalls[2].requestPath, '/accounts/acct/vectorize/v2/indexes/customer-code-index/delete_by_ids');
  assert.equal(apiCalls[3].requestPath, '/accounts/acct/vectorize/v2/indexes/customer-code-index/get_by_ids');
});

test('recommendation preserves local defaults and never serializes credentials', () => {
  const discovery = { repository: { identity: 'local:demo' }, scopes: ['src', 'docs'] };
  const recommendation = recommendAutoRag({ discovery, purpose: 'code' });
  const config = safeAutoRagConfig({ recommendation, repositoryId: 'local:demo' });
  assert.deepEqual(config.scope.include, ['src']);
  assert.equal(config.embedding.provider, 'none');
  assert.equal(config.lane.backend, 'local_exact');
  assert.equal(JSON.stringify(config).includes('API_KEY'), false);
});

test('routing is repository first, then account, then portable default', async () => {
  const routes = [
    { intent_key: 'code_question', account_id: '', repository_id: '', id: 'default' },
    { intent_key: 'code_question', account_id: 'account', repository_id: '', id: 'account' },
    { intent_key: 'code_question', account_id: 'account', repository_id: 'repo', id: 'repository' },
  ];
  assert.equal(selectIntentRoute(routes, { intent: 'code_question', accountId: 'account', repositoryId: 'repo' }).id, 'repository');
  assert.equal(selectIntentRoute(routes, { intent: 'code_question', accountId: 'account', repositoryId: 'other' }).id, 'account');
  const routed = await routeCompanyQuestion({ question: 'where is auth?', repositoryId: 'repo', companyAdapter: { candidateRepositories: async () => ['repo', 'related', 'unrelated'] } });
  assert.deepEqual(routed.repositories, ['repo', 'related', 'unrelated']);
});
