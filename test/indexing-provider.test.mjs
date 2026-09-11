import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REPOSITORY_KNOWLEDGE_PROVIDER_METHODS,
  assertRepositoryKnowledgeProvider,
  createRepositoryKnowledgeClient,
  describeRepositoryKnowledgeProvider,
} from '../src/indexing/index.js';

function provider() {
  return Object.fromEntries(REPOSITORY_KNOWLEDGE_PROVIDER_METHODS.map((method) => [method, async (input) => ({ method, input })]));
}

test('repository knowledge provider is a contract, not a bundled platform implementation', async () => {
  const impl = provider();
  assert.equal(assertRepositoryKnowledgeProvider(impl), impl);
  const client = createRepositoryKnowledgeClient(impl);
  assert.deepEqual(await client.findSymbol({ name: 'resolveModel' }), { method: 'findSymbol', input: { name: 'resolveModel' } });
  assert.deepEqual(await client.retrieve({ query: 'session recovery' }), { method: 'retrieve', input: { query: 'session recovery' } });
  assert.throws(() => assertRepositoryKnowledgeProvider({ status() {} }), /refresh\(\) is required/);
});

test('provider capabilities describe implementation truth without prescribing storage', () => {
  assert.deepEqual(describeRepositoryKnowledgeProvider({
    provider: 'inneranimal-platform', structure: 'tree-sitter', lexical: true, semantic: true, graph: true, history: true, evidence: 'merkle',
  }), {
    provider: 'inneranimal-platform', structure: 'tree-sitter', lexical: true, semantic: true, graph: true, history: true, evidence: 'merkle',
  });
});
