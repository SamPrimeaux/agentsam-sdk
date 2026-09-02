/** Gemini Embedding 2 adapter; profile is supplied per job, never read globally. */
export function createGeminiEmbedder({ apiKey, fetchImpl = globalThis.fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), maxAttempts = 3, timeoutMs = 30000 } = {}) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is required only for embedding/search with --semantic.');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) throw new Error('maxAttempts must be 1..5.');
  return {
    validate(profile) {
      if (profile.provider !== 'gemini' || profile.model !== 'gemini-embedding-2') throw new Error('This adapter supports gemini-embedding-2; inject a different adapter for other models.');
      if (profile.dimensions < 128 || profile.dimensions > 3072) throw new Error('Gemini Embedding 2 dimensions must be 128..3072.');
      if (Object.keys(profile.parameters).some(k => k !== 'task') || !['code retrieval', 'search result', 'question answering'].includes(profile.parameters.task)) throw new Error('Unsupported Gemini embedding parameters.');
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
        } catch { if (attempt + 1 === maxAttempts) throw new Error('Gemini embedding request failed or timed out.'); }
        if (response?.ok) return (await response.json()).embedding?.values;
        if (response && ![408, 429, 500, 502, 503, 504].includes(response.status)) throw new Error(`Gemini embedding failed (HTTP ${response.status}).`);
        if (attempt + 1 === maxAttempts) throw new Error(`Gemini embedding retry limit reached${response ? ` (HTTP ${response.status})` : ''}.`);
        await response?.body?.cancel();
        await sleep(Math.min(10000, 500 * 2 ** attempt + Math.floor(Math.random() * 250)));
      }
    },
  };
}
