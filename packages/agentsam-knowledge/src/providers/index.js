const clean = value => String(value || '').trim();
const finiteVector = (vector, dimensions) => {
  if (!Array.isArray(vector) || vector.length !== dimensions || vector.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`provider_vector_dimension_mismatch:${Array.isArray(vector) ? vector.length : 'invalid'}!=${dimensions}`);
  }
  return vector;
};

function httpAdapter({ id, env, models, request, credentials = env }) {
  return Object.freeze({
    id,
    capabilities: () => ({ id, operational: Boolean(credentials()), models, credentials: credentials() ? 'available' : 'missing' }),
    validate(profile) {
      if (clean(profile?.provider) !== id) throw new Error(`provider_profile_mismatch:${id}`);
      if (!models.includes(clean(profile?.model))) throw new Error(`provider_model_unsupported:${id}:${profile?.model}`);
      if (!Number.isInteger(profile?.dimensions) || profile.dimensions < 1) throw new Error('provider_dimensions_required');
      if (!credentials()) throw new Error(`provider_credentials_unavailable:${id}`);
    },
    dimensions: profile => profile?.dimensions,
    async embedDocuments(inputs, profile, context = {}) { this.validate(profile); return Promise.all(inputs.map(input => request(String(input), profile, { ...context, kind: 'document' }))); },
    async embedQuery(input, profile, context = {}) { this.validate(profile); return request(String(input), profile, { ...context, kind: 'query' }); },
    health: async () => ({ id, operational: Boolean(credentials()), models, credentials: credentials() ? 'available' : 'missing' }),
  });
}

export function createFixtureProvider({ dimensions = 3 } = {}) {
  const vector = text => {
    const bytes = Buffer.from(String(text)); const values = Array.from({ length: dimensions }, () => 0);
    for (let i = 0; i < bytes.length; i++) values[i % dimensions] += (bytes[i] % 23) + 1;
    const norm = Math.hypot(...values) || 1;
    return values.map(value => value / norm);
  };
  return Object.freeze({
    id: 'fixture', capabilities: () => ({ id: 'fixture', operational: true, deterministic: true, models: ['deterministic'] }),
    validate(profile) { if (profile?.provider !== 'fixture') throw new Error('provider_profile_mismatch:fixture'); if (profile.dimensions !== dimensions) throw new Error(`provider_vector_dimension_mismatch:${profile.dimensions}!=${dimensions}`); },
    dimensions: profile => profile?.dimensions,
    async embedDocuments(inputs, profile) { this.validate(profile); return inputs.map(vector); },
    async embedQuery(input, profile) { this.validate(profile); return vector(input); },
    health: async () => ({ id: 'fixture', operational: true }),
  });
}

export function createGeminiProvider({ apiKey = process.env.GEMINI_API_KEY, fetchImpl = globalThis.fetch } = {}) {
  return httpAdapter({ id: 'gemini', env: 'GEMINI_API_KEY', models: ['gemini-embedding-2'], credentials: () => apiKey,
    request: async (text, profile, context) => {
      const prefix = context.kind === 'query' ? `task: ${profile.parameters?.task || 'code retrieval'} | query: ` : 'title: none | text: ';
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${profile.model}:embedContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify({ model: `models/${profile.model}`, content: { parts: [{ text: prefix + text }] }, outputDimensionality: profile.dimensions }) });
      if (!response.ok) throw new Error(`provider_request_failed:gemini:${response.status}`);
      return finiteVector((await response.json()).embedding?.values, profile.dimensions);
    } });
}

export function createOpenAIProvider({ apiKey = process.env.OPENAI_API_KEY, fetchImpl = globalThis.fetch } = {}) {
  return httpAdapter({ id: 'openai', env: 'OPENAI_API_KEY', models: ['text-embedding-3-small', 'text-embedding-3-large'], credentials: () => apiKey,
    request: async (text, profile) => {
      const response = await fetchImpl('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: profile.model, input: text, dimensions: profile.dimensions }) });
      if (!response.ok) throw new Error(`provider_request_failed:openai:${response.status}`);
      return finiteVector((await response.json()).data?.[0]?.embedding, profile.dimensions);
    } });
}

export function createWorkersAiProvider({ binding } = {}) {
  return Object.freeze({
    id: 'workers-ai', capabilities: () => ({ id: 'workers-ai', operational: Boolean(binding?.run), execution: 'authenticated-runtime' }),
    validate(profile) { if (profile?.provider !== 'workers-ai') throw new Error('provider_profile_mismatch:workers-ai'); if (!binding?.run) throw new Error('provider_credentials_unavailable:workers-ai'); },
    dimensions: profile => profile?.dimensions,
    async embedDocuments(inputs, profile) { this.validate(profile); return Promise.all(inputs.map(input => binding.run(profile.model, { text: [input] }).then(result => finiteVector(result?.data?.[0] || result?.[0], profile.dimensions)))); },
    async embedQuery(input, profile) { return (await this.embedDocuments([input], profile))[0]; },
    health: async () => ({ id: 'workers-ai', operational: Boolean(binding?.run), execution: 'authenticated-runtime' }),
  });
}

export function createOllamaProvider({ endpoint = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434', fetchImpl = globalThis.fetch } = {}) {
  return httpAdapter({ id: 'ollama', env: 'OLLAMA_HOST', models: ['nomic-embed-text', 'mxbai-embed-large'], credentials: () => endpoint,
    request: async (text, profile) => {
      const response = await fetchImpl(new URL('/api/embed', endpoint), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: profile.model, input: text }) });
      if (!response.ok) throw new Error(`provider_request_failed:ollama:${response.status}`);
      return finiteVector((await response.json()).embeddings?.[0], profile.dimensions);
    } });
}

export function createProviderRegistry(options = {}) {
  const adapters = new Map([
    ['fixture', createFixtureProvider(options.fixture)],
    ['gemini', createGeminiProvider(options.gemini)],
    ['openai', createOpenAIProvider(options.openai)],
    ['workers-ai', createWorkersAiProvider(options.workersAi)],
    ['ollama', createOllamaProvider(options.ollama)],
  ]);
  return Object.freeze({
    ids: () => [...adapters.keys()],
    get(id) { const adapter = adapters.get(clean(id)); if (!adapter) throw new Error(`provider_unsupported:${id}`); return adapter; },
    capabilities: async () => Promise.all([...adapters.values()].map(async adapter => adapter.health())),
  });
}
