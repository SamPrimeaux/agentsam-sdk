import { AgentSamError, classifyGeminiFailure } from '../../errors/index.js';

/** Gemini Embedding 2 adapter; profile is supplied per job, never read globally. */
export function createGeminiEmbedder({ apiKey, fetchImpl = globalThis.fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), maxAttempts = 3, timeoutMs = 30000 } = {}) {
  if (!apiKey) throw new AgentSamError(classifyGeminiFailure({
    credential_state: 'missing',
    message: 'GEMINI_API_KEY is required only for embedding/search with --semantic.',
  }, { domain: 'knowledge', tool: 'gemini', stage: 'embedding' }));
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) throw new AgentSamError(classifyGeminiFailure({
    status: 400,
    message: 'maxAttempts must be 1..5.',
  }, { domain: 'knowledge', tool: 'gemini', stage: 'configuration', request_origin: 'user' }));
  return {
    validate(profile) {
      if (profile.provider !== 'gemini' || profile.model !== 'gemini-embedding-2') throw new AgentSamError(classifyGeminiFailure({ status: 400, message: 'This adapter supports gemini-embedding-2; inject a different adapter for other models.' }, { domain: 'knowledge', tool: 'gemini', stage: 'configuration', request_origin: 'user' }));
      if (profile.dimensions < 128 || profile.dimensions > 3072) throw new AgentSamError(classifyGeminiFailure({ status: 400, message: 'Gemini Embedding 2 dimensions must be 128..3072.' }, { domain: 'knowledge', tool: 'gemini', stage: 'configuration', request_origin: 'user' }));
      if (Object.keys(profile.parameters).some(k => k !== 'task') || !['code retrieval', 'search result', 'question answering'].includes(profile.parameters.task)) throw new AgentSamError(classifyGeminiFailure({ status: 400, message: 'Unsupported Gemini embedding parameters.' }, { domain: 'knowledge', tool: 'gemini', stage: 'configuration', request_origin: 'user' }));
    },
    async embed(text, profile, { kind = 'document' } = {}) {
      this.validate(profile);
      // Paths stay in retrieval metadata, so moving unchanged code costs no embedding.
      const input = kind === 'query' ? `task: ${profile.parameters.task} | query: ${text}` : `title: none | text: ${text}`;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        let response;
        try {
          response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${profile.model}:embedContent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(timeoutMs),
            body: JSON.stringify({ model: `models/${profile.model}`, content: { parts: [{ text: input }] }, outputDimensionality: profile.dimensions }),
          });
        } catch (cause) {
          if (attempt + 1 === maxAttempts) {
            throw new AgentSamError(classifyGeminiFailure({
              status: 504,
              status_name: 'UNAVAILABLE',
              message: 'Gemini embedding request failed or timed out.',
              exception_type: cause?.name,
              stack: cause?.stack,
            }, { domain: 'knowledge', tool: 'gemini', stage: 'embedding', reason: 'transport_timeout' }), { cause });
          }
        }
        if (response?.ok) return (await response.json()).embedding?.values;
        let providerBody = null;
        if (response) {
          try { providerBody = await response.clone().json(); } catch { providerBody = null; }
        }
        if (response && ![408, 429, 500, 502, 503, 504].includes(response.status)) {
          throw new AgentSamError(classifyGeminiFailure({
            status: response.status,
            status_name: providerBody?.error?.status,
            code: providerBody?.error?.code,
            message: providerBody?.error?.message || `Gemini embedding failed (HTTP ${response.status}).`,
            headers: response.headers,
            body: providerBody,
          }, { domain: 'knowledge', tool: 'gemini', stage: 'embedding', request_origin: 'agentsam' }));
        }
        if (attempt + 1 === maxAttempts) {
          throw new AgentSamError(classifyGeminiFailure({
            status: response?.status || 503,
            status_name: providerBody?.error?.status,
            code: providerBody?.error?.code,
            message: providerBody?.error?.message || `Gemini embedding retry limit reached${response ? ` (HTTP ${response.status})` : ''}.`,
            headers: response?.headers,
            body: providerBody,
          }, { domain: 'knowledge', tool: 'gemini', stage: 'embedding' }));
        }
        await response?.body?.cancel();
        await sleep(Math.min(10000, 500 * 2 ** attempt + Math.floor(Math.random() * 250)));
      }
    },
  };
}
