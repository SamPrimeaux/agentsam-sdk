import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectModelsStatus, renderModelsStatus } from '../src/commands/models.js';

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-model-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

test('model inventory reports configured API providers without exposing credentials', async t => {
  const home = tempHome(t);
  const status = await collectModelsStatus({
    home,
    discoverRemote: false,
    env: {
      OPENAI_API_KEY: 'secret-openai', GEMINI_API_KEY: '', XAI_API_KEY: 'secret-xai', ANTHROPIC_API_KEY: 'secret-anthropic', CLOUDFLARE_API_TOKEN: 'secret-cf', ACCOUNT_ID: '33333333333333333333333333333333',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434', OLLAMA_MODEL: 'qwen:test', OLLAMA_EMBED_MODEL: 'embed:test',
    },
    fetchImpl: async () => response({ models: [{ name: 'qwen:test' }, { name: 'embed:test' }] }),
  });
  assert.equal(status.providers.find((row) => row.id === 'openai').configured, true);
  assert.equal(status.providers.find((row) => row.id === 'gemini').configured, false);
  assert.equal(status.providers.find((row) => row.id === 'grok').configured, true);
  assert.equal(status.providers.find((row) => row.id === 'anthropic').configured, true);
  assert.equal(status.providers.find((row) => row.id === 'cloudflare').configured, true);
  assert.equal(status.local.online, true);
  assert.deepEqual(status.local.models.map((row) => row.name), ['qwen:test', 'embed:test']);
  const rendered = renderModelsStatus(status);
  assert.match(rendered, /OpenAI/);
  assert.match(rendered, /qwen:test/);
  assert.doesNotMatch(rendered, /secret-openai|secret-xai|secret-anthropic|secret-cf/);
});

test('exact hosted model availability is verified against the provider inventory', async () => {
  const status = await collectModelsStatus({
    env: { OPENAI_API_KEY: 'secret-openai', OLLAMA_BASE_URL: 'http://127.0.0.1:11434' },
    fetchImpl: async () => response({ models: [] }),
    providerFetchImpl: async () => response({ data: [{ id: 'gpt-6-astra' }, { id: 'some-other-model' }] }),
  });
  assert.equal(status.discovery.openai.ok, true);
  assert.equal(status.discovery.openai.returnedModelCount, 2);
  assert.deepEqual(status.availableModels.map((row) => row.provider_model_id), ['gpt-6-astra', 'some-other-model']);
  assert.equal(status.availableModels[0].availability_source, 'provider_api');
  assert.equal(status.availableModels[0].context_window_source, 'sdk_reference');
});




test('Gemini and xAI discovery keep per-key limits from provider metadata', async () => {
  const seen = [];
  const status = await collectModelsStatus({
    env: {
      GEMINI_API_KEY: 'gem-key',
      XAI_API_KEY: 'xai-key',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    },
    fetchImpl: async () => response({ models: [] }),
    providerFetchImpl: async (url, options) => {
      seen.push(url);
      if (url.includes('generativelanguage.googleapis.com')) {
        return response({ models: [{
          name: 'models/gemini-test',
          baseModelId: 'gemini-test',
          displayName: 'Gemini Test',
          inputTokenLimit: 123456,
          outputTokenLimit: 8192,
          supportedGenerationMethods: ['generateContent'],
          thinking: true,
        }] });
      }
      if (url.includes('api.x.ai')) {
        return response({ data: [{
          id: 'grok-test',
          context_length: 256000,
          prompt_text_token_price: 1000,
          cached_prompt_text_token_price: 500,
          completion_text_token_price: 4000,
        }] });
      }
      throw new Error('unexpected URL ' + url);
    },
  });

  const gemini = status.providerModels.gemini[0];
  assert.equal(gemini.provider_model_id, 'gemini-test');
  assert.equal(gemini.context_window, 123456);
  assert.equal(gemini.context_window_source, 'provider_api');
  assert.deepEqual(gemini.reasoning_efforts, ['auto', 'low', 'medium', 'high']);

  const grok = status.providerModels.grok[0];
  assert.equal(grok.provider_model_id, 'grok-test');
  assert.equal(grok.context_window, 256000);
  assert.equal(grok.pricing.input, 1);
  assert.equal(grok.pricing.output, 4);
  assert.equal(seen.some((url) => url.includes('generativelanguage.googleapis.com')), true);
  assert.equal(seen.some((url) => url.includes('api.x.ai')), true);
});


test('Cloudflare discovery is scoped to the loaded account and surfaces text-generation models only', async t => {
  const seen = [];
  const home = tempHome(t);
  const status = await collectModelsStatus({
    home,
    env: { CLOUDFLARE_API_TOKEN: 'secret-cf', ACCOUNT_ID: '44444444444444444444444444444444', OLLAMA_BASE_URL: 'http://127.0.0.1:11434' },
    fetchImpl: async () => response({ models: [] }),
    providerFetchImpl: async (url, options) => {
      seen.push({ url, auth: options.headers.authorization });
      return response({ success: true, result: [
        { name: '@cf/qwen/code', task: { name: 'Text Generation' }, description: 'coding' },
        { name: '@cf/baai/embed', task: { name: 'Text Embeddings' }, description: 'embeddings' },
      ] });
    },
  });
  assert.equal(seen.length, 1);
  assert.match(seen[0].url, /accounts\/44444444444444444444444444444444\/ai\/models\/search$/);
  assert.equal(status.discovery.cloudflare.ok, true);
  assert.equal(status.discovery.cloudflare.returnedModelCount, 1);
  assert.deepEqual(status.providerModels.cloudflare.map((row) => row.provider_model_id), ['@cf/qwen/code']);
  const rendered = renderModelsStatus(status);
  assert.match(rendered, /@cf\/qwen\/code/);
  assert.doesNotMatch(rendered, /@cf\/baai\/embed/);
  assert.doesNotMatch(rendered, /secret-cf/);
});
