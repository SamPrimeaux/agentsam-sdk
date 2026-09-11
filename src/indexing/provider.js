export const REPOSITORY_KNOWLEDGE_PROVIDER_METHODS = Object.freeze([
  'status',
  'refresh',
  'findSymbol',
  'graph',
  'retrieve',
  'snapshot',
]);

export function assertRepositoryKnowledgeProvider(provider) {
  if (!provider || typeof provider !== 'object') throw new TypeError('RepositoryKnowledgeProvider must be an object');
  for (const method of REPOSITORY_KNOWLEDGE_PROVIDER_METHODS) {
    if (typeof provider[method] !== 'function') throw new TypeError(`RepositoryKnowledgeProvider.${method}() is required`);
  }
  return provider;
}

export function createRepositoryKnowledgeClient(provider) {
  const impl = assertRepositoryKnowledgeProvider(provider);
  const call = (method, input = {}) => Promise.resolve(impl[method](input));
  return Object.freeze({
    status: (input) => call('status', input),
    refresh: (input) => call('refresh', input),
    findSymbol: (input) => call('findSymbol', input),
    graph: (input) => call('graph', input),
    retrieve: (input) => call('retrieve', input),
    snapshot: (input) => call('snapshot', input),
  });
}

export function describeRepositoryKnowledgeProvider(capabilities = {}) {
  return Object.freeze({
    structure: capabilities.structure || 'unknown',
    lexical: capabilities.lexical !== false,
    semantic: Boolean(capabilities.semantic),
    graph: Boolean(capabilities.graph),
    history: Boolean(capabilities.history),
    evidence: capabilities.evidence || 'unknown',
    provider: capabilities.provider || 'custom',
  });
}
