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
      OPENAI_API_KEY: 'secret-openai', GEMINI_API_KEY: '', XAI_API_KEY: 'secret-xai', ANTHROPIC_API_KEY: 'secret-anthropic', CLOUDFLARE_API_TOKEN: 'secret-cf', CLOUDFLARE_ACCOUNT_ID: '33333333333333333333333333333333',
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

test('static/reference metadata never invents hosted model availability', async t => {
  const home = tempHome(t);
  const status = await collectModelsStatus({
    home,
    env: { OPENAI_API_KEY: 'secret-openai', OLLAMA_BASE_URL: 'http://127.0.0.1:11434' },
    fetchImpl: async () => response({ models: [] }),
    providerFetchImpl: async () => response({ data: [{ id: 'some-other-model' }] }),
  });

  assert.deepEqual(status.availableModels.map((row) => row.provider_model_id), ['some-other-model']);
  const referenceOnly = status.catalogModels.find((row) => row.provider_model_id === 'gpt-6-astra');
  assert.equal(referenceOnly?.availability, 'unverified');
  assert.equal(referenceOnly?.availability_source, 'sdk_reference');
});

test('exact hosted model availability is verified against the provider inventory', async t => {
  const home = tempHome(t);
  const status = await collectModelsStatus({
    home,
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




test('Gemini and xAI discovery keep per-key limits from provider metadata', async t => {
  const home = tempHome(t);
  const seen = [];
  const status = await collectModelsStatus({
    home,
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


test('Cloudflare discovery is scoped to the loaded account and surfaces text-generation + embeddings', async t => {
  const seen = [];
  const home = tempHome(t);
  const status = await collectModelsStatus({
    home,
    curateWorkersAi: false,
    env: { CLOUDFLARE_API_TOKEN: 'secret-cf', CLOUDFLARE_ACCOUNT_ID: '44444444444444444444444444444444', OLLAMA_BASE_URL: 'http://127.0.0.1:11434' },
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
  assert.equal(status.discovery.cloudflare.returnedModelCount, 2);
  assert.deepEqual(
    status.providerModels.cloudflare.map((row) => row.provider_model_id).sort(),
    ['@cf/baai/embed', '@cf/qwen/code'],
  );
  const embed = status.providerModels.cloudflare.find((row) => row.provider_model_id === '@cf/baai/embed');
  const qwen = status.providerModels.cloudflare.find((row) => row.provider_model_id === '@cf/qwen/code');
  assert.equal(qwen.availability_source, 'provider_api');
  assert.equal(qwen.context_window_source, 'unknown');
  const rendered = renderModelsStatus(status);
  assert.match(rendered, /@cf\/qwen\/code/);
  assert.match(rendered, /@cf\/baai\/embed/);
  assert.doesNotMatch(rendered, /secret-cf/);
});

test('Cursor participates in machine inventory when CURSOR_API_KEY is configured', async t => {
  const home = tempHome(t);
  const seen = [];
  const status = await collectModelsStatus({
    home,
    env: {
      CURSOR_API_KEY: 'cursor-secret-key',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    },
    fetchImpl: async () => response({ models: [] }),
    providerFetchImpl: async (url, options) => {
      seen.push({ url, auth: options?.headers?.authorization });
      if (String(url).includes('api.cursor.com')) {
        return response({
          items: [
            { id: 'composer-2.5', displayName: 'Composer 2.5', parameters: [] },
            { id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', parameters: [{ id: 'reasoning', values: [{ value: 'high' }] }] },
          ],
        });
      }
      throw new Error('unexpected URL ' + url);
    },
  });

  const cursor = status.providers.find((row) => row.id === 'cursor');
  assert.equal(cursor?.configured, true);
  assert.equal(status.discovery.cursor.ok, true);
  assert.equal(status.discovery.cursor.returnedModelCount, 2);
  assert.equal(seen.length, 1);
  assert.match(seen[0].url, /api\.cursor\.com\/v1\/models/);
  assert.match(seen[0].auth, /Bearer cursor-secret-key/);
  assert.deepEqual(
    status.availableModels.filter((row) => row.provider === 'cursor').map((row) => row.provider_model_id),
    ['composer-2.5', 'gpt-5.6-sol'],
  );
  const rendered = renderModelsStatus(status);
  assert.match(rendered, /Cursor/);
  assert.match(rendered, /composer-2\.5/);
  assert.doesNotMatch(rendered, /cursor-secret-key/);
});

test('missing Cursor credential skips discovery and does not fall back to another provider', async t => {
  const home = tempHome(t);
  const seen = [];
  const status = await collectModelsStatus({
    home,
    env: {
      OPENAI_API_KEY: 'secret-openai',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    },
    fetchImpl: async () => response({ models: [] }),
    providerFetchImpl: async (url) => {
      seen.push(url);
      if (String(url).includes('api.openai.com')) return response({ data: [{ id: 'gpt-test' }] });
      if (String(url).includes('api.cursor.com')) throw new Error('cursor must not be called');
      return response({ data: [] });
    },
  });
  assert.equal(status.providers.find((row) => row.id === 'cursor')?.configured, false);
  assert.equal(status.discovery.cursor.attempted, false);
  assert.equal(seen.some((url) => String(url).includes('api.cursor.com')), false);
  assert.equal(status.availableModels.some((row) => row.provider === 'cursor'), false);
  assert.equal(status.availableModels.some((row) => row.provider === 'openai'), true);
});

test('Cursor discovery failure stays attached to Cursor and does not invent OpenAI models', async t => {
  const home = tempHome(t);
  const status = await collectModelsStatus({
    home,
    env: {
      CURSOR_API_KEY: 'bad-cursor-key',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    },
    fetchImpl: async () => response({ models: [] }),
    providerFetchImpl: async (url) => {
      if (String(url).includes('api.cursor.com')) {
        return { ok: false, status: 401, async json() { return { error: 'unauthorized' }; } };
      }
      throw new Error('unexpected URL ' + url);
    },
  });
  assert.equal(status.providers.find((row) => row.id === 'cursor')?.configured, true);
  assert.equal(status.discovery.cursor.ok, false);
  assert.ok(status.discovery.cursor.error);
  assert.equal((status.providerModels.cursor || []).length, 0);
  assert.equal(status.availableModels.some((row) => row.provider === 'openai'), false);
});

test('Workers AI curated allowlist intersects live Cloudflare discovery', async t => {
  const home = tempHome(t);
  const status = await collectModelsStatus({
    home,
    curateWorkersAi: true,
    env: { CLOUDFLARE_API_TOKEN: 'secret-cf', CLOUDFLARE_ACCOUNT_ID: '44444444444444444444444444444444', OLLAMA_BASE_URL: 'http://127.0.0.1:11434' },
    fetchImpl: async () => response({ models: [] }),
    providerFetchImpl: async () => response({
      success: true,
      result: [
        { name: '@cf/qwen/qwen2.5-coder-32b-instruct', task: { name: 'Text Generation' } },
        { name: '@cf/meta/llama-3.2-1b-instruct', task: { name: 'Text Generation' } },
        { name: '@cf/openai/gpt-oss-120b', task: { name: 'Text Generation' } },
        { name: '@cf/baai/bge-base-en-v1.5', task: { name: 'Text Embeddings' } },
      ],
    }),
  });
  // Chat allowlist applies to Text Generation; Text Embeddings always pass (Vectorize lane).
  assert.deepEqual(
    status.providerModels.cloudflare.map((row) => row.provider_model_id).sort(),
    ['@cf/baai/bge-base-en-v1.5', '@cf/openai/gpt-oss-120b', '@cf/qwen/qwen2.5-coder-32b-instruct'],
  );
  assert.equal(status.discovery.cloudflare.curation, 'agentsam_workers_ai_allowlist');
});

test('studio vault credential plane never reads machine env when resolver is injected', async t => {
  const home = tempHome(t);
  const status = await collectModelsStatus({
    home,
    credentialPlane: 'studio_vault',
    includeLocal: false,
    env: { OPENAI_API_KEY: 'machine-must-not-be-used', CURSOR_API_KEY: 'machine-cursor' },
    resolveCredential: async (providerId) => {
      if (providerId === 'gemini') {
        return { configured: true, value: 'vault-gemini', source: 'user_vault', env: 'GEMINI_API_KEY' };
      }
      return { configured: false, value: '', source: null, error: null };
    },
    fetchImpl: async () => response({ models: [] }),
    providerFetchImpl: async (url) => {
      if (String(url).includes('generativelanguage.googleapis.com') && String(url).includes('vault-gemini')) {
        return response({
          models: [{
            name: 'models/gemini-vault',
            baseModelId: 'gemini-vault',
            displayName: 'Vault Gemini',
            inputTokenLimit: 1000,
            supportedGenerationMethods: ['generateContent'],
          }],
        });
      }
      throw new Error('machine providers must not be discovered: ' + url);
    },
  });
  assert.equal(status.credential_plane, 'studio_vault');
  assert.equal(status.providers.find((row) => row.id === 'openai')?.configured, false);
  assert.equal(status.providers.find((row) => row.id === 'gemini')?.configured, true);
  assert.equal(status.providers.find((row) => row.id === 'gemini')?.source, 'user_vault');
  assert.deepEqual(status.availableModels.map((row) => row.provider_model_id), ['gemini-vault']);
});
