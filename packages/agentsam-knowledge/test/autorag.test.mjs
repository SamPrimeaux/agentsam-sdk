import assert from 'node:assert/strict';
import test from 'node:test';
import { createFixtureProvider, createProviderRegistry, createBackendRegistry, recommendAutoRag, safeAutoRagConfig, selectIntentRoute, routeCompanyQuestion } from '../src/index.js';

test('provider registry is explicit, deterministic, and fails closed', async () => {
  const registry = createProviderRegistry({ fixture: { dimensions: 3 }, gemini: { apiKey: null }, openai: { apiKey: null } });
  assert.deepEqual(registry.ids(), ['fixture', 'gemini', 'openai', 'workers-ai', 'ollama']);
  const fixture = createFixtureProvider({ dimensions: 3 });
  const profile = { provider: 'fixture', model: 'deterministic', dimensions: 3 };
  assert.equal((await fixture.embedQuery('hello', profile)).length, 3);
  assert.throws(() => registry.get('not-a-provider'), /provider_unsupported/);
  assert.equal((await registry.capabilities()).find(item => item.id === 'gemini').operational, false);
});

test('backend registry requires explicit resources and dimensions', () => {
  const registry = createBackendRegistry();
  assert.deepEqual(registry.get('local_exact').prepare({ backend: 'local_exact', dimensions: 3 }), { id: 'local_exact', dimensions: 3 });
  assert.throws(() => registry.get('cloudflare_vectorize').prepare({ backend: 'cloudflare_vectorize', dimensions: 3 }), /binding_required/);
  assert.throws(() => registry.get('unknown'), /backend_unsupported/);
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
