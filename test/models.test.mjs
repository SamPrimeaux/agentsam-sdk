import assert from 'node:assert/strict';
import test from 'node:test';

import { collectModelsStatus, renderModelsStatus } from '../src/commands/models.js';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test('model inventory reports configured API providers without exposing credentials', async () => {
  const status = await collectModelsStatus({
    env: {
      OPENAI_API_KEY: 'secret-openai',
      GEMINI_API_KEY: '',
      XAI_API_KEY: 'secret-xai',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
      OLLAMA_MODEL: 'qwen:test',
      OLLAMA_EMBED_MODEL: 'embed:test',
    },
    fetchImpl: async () => response({ models: [{ name: 'qwen:test' }, { name: 'embed:test' }] }),
  });

  assert.equal(status.providers.find((row) => row.id === 'openai').configured, true);
  assert.equal(status.providers.find((row) => row.id === 'gemini').configured, false);
  assert.equal(status.providers.find((row) => row.id === 'grok').configured, true);
  assert.equal(status.local.online, true);
  assert.deepEqual(status.local.models.map((row) => row.name), ['qwen:test', 'embed:test']);

  const rendered = renderModelsStatus(status);
  assert.match(rendered, /OpenAI/);
  assert.match(rendered, /qwen:test/);
  assert.doesNotMatch(rendered, /secret-openai|secret-xai/);
});
