/**
 * Discover embedding (and optional local assist) models from the user's
 * configured credentials + live Ollama inventory — not a hardcoded product menu.
 */

import { collectModelsStatus } from '../../commands/models.js';
import { resolveOllamaConfig, probeOllama, probeOllamaModel } from '../../commands/ollama.js';
import { resolveProviderCredential } from '../provider-credentials.js';
import { createProviderRegistry } from '../../../packages/agentsam-knowledge/src/providers/index.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function looksLikeEmbedModel(name) {
  const id = clean(name).toLowerCase();
  if (!id) return false;
  return /embed|bge-|e5-|gte-|minilm|mxbai-embed|nomic-embed|snowflake-arctic-embed/i.test(id);
}

function defaultDimensions(provider, model) {
  const id = clean(model).toLowerCase();
  if (provider === 'openai') {
    if (id.includes('large')) return 3072;
    if (id.includes('small')) return 1536;
    return 1536;
  }
  if (provider === 'gemini') {
    if (id.includes('embedding')) return 768;
    return 768;
  }
  if (provider === 'ollama') {
    if (id.includes('mxbai-embed-large')) return 1024;
    if (id.includes('nomic-embed')) return 768;
    return 1024;
  }
  return 768;
}

/**
 * Encode a selectable embedding profile for clack / CLI.
 * Format: provider|model|dimensions  (pipe — models may contain colons)
 */
export function encodeEmbeddingChoice(provider, model, dimensions) {
  return `${provider}|${model}|${dimensions}`;
}

/**
 * @param {string} value
 */
export function parseEmbeddingChoice(value) {
  if (!value || value === 'none') {
    return { provider: 'none', model: 'none', revision: '1', dimensions: 0, parameters: {} };
  }
  // New encoding: provider|model|dims
  if (String(value).includes('|')) {
    const [provider, model, dims] = String(value).split('|');
    return {
      provider: clean(provider),
      model: clean(model),
      revision: '1',
      dimensions: Number(dims) || defaultDimensions(provider, model),
      parameters: provider === 'gemini' ? { task: 'code retrieval' } : {},
    };
  }
  // Legacy encoding used briefly: provider:model:dims (breaks on model ids with colons)
  const parts = String(value).split(':');
  if (parts.length >= 3) {
    const provider = parts[0];
    const dims = parts[parts.length - 1];
    const model = parts.slice(1, -1).join(':');
    return {
      provider: clean(provider),
      model: clean(model),
      revision: '1',
      dimensions: Number(dims) || defaultDimensions(provider, model),
      parameters: provider === 'gemini' ? { task: 'code retrieval' } : {},
    };
  }
  throw new Error(`invalid_embedding_choice:${value}`);
}

/**
 * Build embedding select options from live discovery.
 * Always offers "none" (AST/text only). Ollama entries appear only when online.
 *
 * @param {object} [options]
 * @returns {Promise<{ options: object[], inventory: object, assistModels: object[] }>}
 */
export async function discoverIngestModelOptions(options = {}) {
  const env = options.env || process.env;
  const status = await collectModelsStatus({
    env,
    home: options.home,
    discoverRemote: options.discoverRemote !== false,
    includeLocal: true,
    fetchImpl: options.fetchImpl,
    providerFetchImpl: options.providerFetchImpl,
  });

  /** @type {Map<string, object>} */
  const byValue = new Map();
  const push = (row) => {
    if (!row?.value || byValue.has(row.value)) return;
    byValue.set(row.value, row);
  };

  push({
    value: 'none',
    label: 'None — AST/text only ($0 embeddings)',
    hint: 'deterministic · no provider spend',
    provider: 'none',
    source: 'builtin',
  });

  // Credential-scoped OpenAI embedding models from live /v1/models
  for (const row of status.providerModels?.openai || []) {
    const caps = row.capabilities || {};
    const id = row.provider_model_id || '';
    if (caps.embeddings === true || /^text-embedding-/i.test(id)) {
      const dims = defaultDimensions('openai', id);
      push({
        value: encodeEmbeddingChoice('openai', id, dims),
        label: `OpenAI · ${id}`,
        hint: `credential · ${dims}d`,
        provider: 'openai',
        source: 'provider_api',
        model: id,
        dimensions: dims,
      });
    }
  }

  // Gemini: if key configured, offer models from knowledge adapter + any discovered embed ids
  const geminiCred = resolveProviderCredential('gemini', { env, home: options.home });
  if (geminiCred?.configured) {
    const registry = createProviderRegistry({
      gemini: { apiKey: geminiCred.value || env.GEMINI_API_KEY },
    });
    const caps = registry.get('gemini').capabilities();
    for (const id of caps.models || []) {
      const dims = defaultDimensions('gemini', id);
      push({
        value: encodeEmbeddingChoice('gemini', id, dims),
        label: `Gemini · ${id}`,
        hint: `credential · ${dims}d`,
        provider: 'gemini',
        source: 'provider_credential',
        model: id,
        dimensions: dims,
      });
    }
  }

  // Live Ollama inventory — offer embed-like models only for the embedding picker
  /** @type {object[]} */
  const assistModels = [];
  if (status.local?.online) {
    const ollamaConfig = resolveOllamaConfig({}, env);
    for (const row of status.local.models || []) {
      const name = clean(row.name || row.model);
      if (!name) continue;
      const probe = options.skipOllamaProbe
        ? { ok: true, capabilities: [] }
        : await probeOllamaModel(name, ollamaConfig, options.fetchImpl || fetch);
      const caps = Array.isArray(probe.capabilities) ? probe.capabilities : [];
      const isEmbed = looksLikeEmbedModel(name) || caps.includes('embedding') || caps.includes('embed');
      if (isEmbed) {
        const dims = defaultDimensions('ollama', name);
        push({
          value: encodeEmbeddingChoice('ollama', name, dims),
          label: `Ollama · ${name}`,
          hint: `local · free · ${dims}d`,
          provider: 'ollama',
          source: 'ollama_tags',
          model: name,
          dimensions: dims,
        });
      } else {
        assistModels.push({
          value: `ollama|${name}`,
          label: `Ollama · ${name}`,
          hint: 'local assist (allowlist suggestions)',
          provider: 'ollama',
          model: name,
          source: 'ollama_tags',
        });
      }
    }
  }

  return {
    options: [...byValue.values()],
    inventory: status,
    assistModels,
    ollama: status.local,
  };
}

/**
 * Ask a local Ollama chat model to suggest include/exclude paths.
 * Optional — never required for ingest.
 *
 * @param {{ root: string, model: string, topLevel: string[], fetchImpl?: typeof fetch, env?: object }} opts
 */
export async function suggestScopeWithLocalModel(opts) {
  const env = opts.env || process.env;
  const config = resolveOllamaConfig({}, env);
  const endpoint = new URL('/api/generate', config.baseUrl);
  const listing = (opts.topLevel || []).slice(0, 80).join('\n');
  const prompt = [
    'You help configure a repository knowledge allowlist/denylist for AgentSam codebaseindex.',
    'Return ONLY compact JSON: {"include":["..."],"exclude":["..."],"rationale":"..."}',
    'include/exclude must be relative path segments (no globs). Prefer source dirs; exclude deps/build caches.',
    `Repository root: ${opts.root}`,
    'Top-level entries:',
    listing || '(empty)',
  ].join('\n');

  const response = await (opts.fetchImpl || fetch)(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: opts.model, prompt, stream: false, format: 'json' }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`ollama_assist_failed:HTTP ${response.status}`);
  }
  const body = await response.json();
  const raw = clean(body?.response);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('ollama_assist_invalid_json');
  }
  const include = Array.isArray(parsed.include) ? parsed.include.map(clean).filter(Boolean) : [];
  const exclude = Array.isArray(parsed.exclude) ? parsed.exclude.map(clean).filter(Boolean) : [];
  return {
    include,
    exclude,
    rationale: clean(parsed.rationale) || null,
    model: opts.model,
    provider: 'ollama',
  };
}

export { probeOllama, resolveOllamaConfig, looksLikeEmbedModel };
