/**
 * Discover embedding models from the user's configured credentials.
 *
 * Authority order for the picker:
 *   1. Credential-scoped cloud providers (OpenAI, Gemini, Cloudflare Workers AI)
 *   2. Optional local Ollama inventory (offer only — never required, never SSOT)
 *   3. Always "none" (AST/text only)
 *
 * Dimensions are profile fingerprints for the chosen provider/model — not "Ollama truth."
 * Regex/name heuristics are hints until a real embed/adapter reports length.
 */

import { collectModelsStatus } from '../../commands/models.js';
import { resolveOllamaConfig, probeOllama, probeOllamaModel } from '../../commands/ollama.js';
import { resolveProviderCredential } from '../provider-credentials.js';
import { createProviderRegistry } from '../../../packages/agentsam-knowledge/src/providers/index.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

/** Known Workers AI / Vectorize-friendly embed dims (hint until first embed probes). */
const WORKERS_AI_EMBED_DIMS = Object.freeze({
  '@cf/baai/bge-small-en-v1.5': 384,
  '@cf/baai/bge-base-en-v1.5': 768,
  '@cf/baai/bge-large-en-v1.5': 1024,
  '@cf/baai/bge-m3': 1024,
  '@cf/google/embeddinggemma-300m': 768,
});

function looksLikeEmbedModel(name) {
  const id = clean(name).toLowerCase();
  if (!id) return false;
  return /embed|bge-|e5-|gte-|minilm|mxbai-embed|nomic-embed|snowflake-arctic-embed/i.test(id);
}

/**
 * Hint dimensions for a provider/model. Not authoritative — adapters may probe.
 */
function defaultDimensions(provider, model) {
  const id = clean(model).toLowerCase();
  if (provider === 'openai') {
    if (id.includes('large')) return 3072;
    if (id.includes('small')) return 1536;
    return 1536;
  }
  if (provider === 'gemini') {
    return 768;
  }
  if (provider === 'workers-ai' || provider === 'cloudflare') {
    if (WORKERS_AI_EMBED_DIMS[clean(model)]) return WORKERS_AI_EMBED_DIMS[clean(model)];
    if (id.includes('small')) return 384;
    if (id.includes('large') || id.includes('bge-m3')) return 1024;
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
 * Always offers "none" (AST/text only). Ollama entries appear only when online (optional).
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
    // Keep CF embed models; chat allowlist must not hide Vectorize options.
    curateWorkersAi: options.curateWorkersAi !== false,
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

  // Cloudflare Workers AI embedding models — required for Vectorize / CF lanes.
  // Uses live account discovery (Text Embeddings). Provider id = workers-ai (knowledge adapter).
  for (const row of status.providerModels?.cloudflare || []) {
    const caps = row.capabilities || {};
    const id = row.provider_model_id || '';
    const task = String(row.metadata?.task || '').toLowerCase();
    const isEmbed = caps.embeddings === true || task === 'text embeddings' || looksLikeEmbedModel(id);
    if (!isEmbed || !id) continue;
    const dims = defaultDimensions('workers-ai', id);
    push({
      value: encodeEmbeddingChoice('workers-ai', id, dims),
      label: `Workers AI · ${id}`,
      hint: `cloudflare · vectorize-ready · ${dims}d`,
      provider: 'workers-ai',
      source: 'provider_api',
      model: id,
      dimensions: dims,
    });
  }

  // Optional local Ollama — never required; only offered when online.
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
        // Prefer probed dim length when the adapter returns it; else name hint.
        const probedDims = Number(probe.dimensions) || Number(probe.embedding_length) || 0;
        const dims = probedDims > 0 ? probedDims : defaultDimensions('ollama', name);
        push({
          value: encodeEmbeddingChoice('ollama', name, dims),
          label: `Ollama · ${name}`,
          hint: `local optional · ${dims}d`,
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
    'Machine inventory already classified top-level paths — prefer refining those categories, do not invent unrelated roots.',
    `Repository root: ${opts.root}`,
    opts.categories ? `Categories JSON: ${JSON.stringify(opts.categories)}` : '',
    'Top-level entries:',
    listing || '(empty)',
  ].filter(Boolean).join('\n');

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

export { probeOllama, resolveOllamaConfig, looksLikeEmbedModel, defaultDimensions, WORKERS_AI_EMBED_DIMS };
