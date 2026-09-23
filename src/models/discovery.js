import { getModelRecord } from './catalog.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function positiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}
function timeoutSignal(ms = 8_000) {
  return typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
}
function failure(error, attempted = true) {
  return { attempted, ok: false, models: [], error: error?.message || String(error || 'unknown error') };
}

function providerReference(provider, id) {
  if (provider !== 'anthropic') return null;
  const million = new Set([
    'claude-fable-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7',
    'claude-opus-4-6', 'claude-sonnet-5', 'claude-sonnet-4-6',
  ]);
  const twoHundredK = new Set([
    'claude-opus-4-5-20251101', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001',
  ]);
  const contextWindow = million.has(id) ? 1_000_000 : twoHundredK.has(id) ? 200_000 : null;
  if (!contextWindow) return null;
  return Object.freeze({
    model_key: `anthropic:${id}`,
    provider: 'anthropic',
    provider_model_id: id,
    label: id,
    context_window: contextWindow,
    max_output_tokens: ['claude-opus-5', 'claude-sonnet-5'].includes(id) ? 128_000 : null,
    reasoning_efforts: Object.freeze(['auto']),
    service_tiers: Object.freeze(['default']),
    capabilities: Object.freeze({ messages: true, function_calling: true, prompt_caching: true, compaction: true }),
    source: Object.freeze({
      url: 'https://docs.anthropic.com/en/docs/about-claude/models/overview',
      as_of: '2026-09-17',
    }),
  });
}

function fallbackRecord(provider, id) {
  const record = getModelRecord(`${provider}:${id}`) || getModelRecord(id) || providerReference(provider, id);
  return record || null;
}

function baseRecord(provider, id, values = {}) {
  const fallback = fallbackRecord(provider, id);
  const contextWindow = positiveInt(values.context_window ?? values.contextWindow ?? fallback?.context_window);
  const maxOutput = positiveInt(values.max_output_tokens ?? values.maxOutputTokens ?? fallback?.max_output_tokens);
  return Object.freeze({
    model_key: provider + ':' + id,
    provider,
    provider_model_id: id,
    label: clean(values.label) || fallback?.label || id,
    kind: clean(values.kind) || fallback?.kind || 'unknown',
    description: clean(values.description) || fallback?.description || null,
    availability: 'available',
    availability_source: 'provider_api',
    context_window: contextWindow,
    context_window_source: values.context_window != null || values.contextWindow != null
      ? 'provider_api'
      : fallback?.context_window ? 'sdk_reference' : 'unknown',
    max_output_tokens: maxOutput,
    max_output_tokens_source: values.max_output_tokens != null || values.maxOutputTokens != null
      ? 'provider_api'
      : fallback?.max_output_tokens ? 'sdk_reference' : 'unknown',
    knowledge_cutoff: values.knowledge_cutoff || fallback?.knowledge_cutoff || null,
    default_reasoning_effort: clean(values.default_reasoning_effort) || fallback?.default_reasoning_effort || null,
    reasoning_efforts: Object.freeze(
      Array.isArray(values.reasoning_efforts) && values.reasoning_efforts.length
        ? [...values.reasoning_efforts]
        : fallback?.reasoning_efforts ? [...fallback.reasoning_efforts] : ['auto'],
    ),
    service_tiers: Object.freeze(
      Array.isArray(values.service_tiers) && values.service_tiers.length
        ? [...values.service_tiers]
        : fallback?.service_tiers ? [...fallback.service_tiers] : ['default'],
    ),
    capabilities: Object.freeze({
      ...(fallback?.capabilities || {}),
      ...(values.capabilities || {}),
    }),
    pricing: values.pricing || fallback?.pricing || null,
    context_policy: values.context_policy || fallback?.context_policy || null,
    batch: values.batch || fallback?.batch || null,
    source: Object.freeze({
      kind: 'provider_api',
      url: clean(values.source_url) || null,
      discovered_at: new Date().toISOString(),
      fallback: fallback?.source || null,
    }),
    metadata: Object.freeze({
      ...(fallback?.metadata && typeof fallback.metadata === 'object' ? fallback.metadata : {}),
      ...(values.metadata && typeof values.metadata === 'object' ? values.metadata : {}),
    }),
  });
}

function openAIModelCapabilities(id) {
  const fallback = fallbackRecord('openai', id);
  if (fallback?.capabilities) return {};
  if (/^text-embedding-/i.test(id)) return { agent_runtime: false, embeddings: true };
  if (/^(?:gpt-image|chatgpt-image|gpt-audio|gpt-realtime|sora|tts|whisper|omni-moderation)/i.test(id)) {
    return { agent_runtime: false };
  }
  if (/^(?:gpt-(?:4o|4\.1|5|6)|o[1-9])/i.test(id)) {
    return { agent_runtime: true, responses: true };
  }
  return { agent_runtime: false };
}

async function fetchJson(fetchImpl, url, init) {
  const response = await fetchImpl(url, { ...init, signal: init?.signal || timeoutSignal() });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    const message = clean(body?.error?.message || body?.message || body?.errors?.[0]?.message) || `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function discoverOpenAIModels(apiKey, fetchImpl = fetch) {
  if (!clean(apiKey)) return failure('credential unavailable', false);
  try {
    const body = await fetchJson(fetchImpl, 'https://api.openai.com/v1/models', {
      headers: { authorization: `Bearer ${clean(apiKey)}` },
    });
    const models = (Array.isArray(body?.data) ? body.data : [])
      .map((row) => clean(row?.id))
      .filter(Boolean)
      .map((id) => baseRecord('openai', id, {
        source_url: 'https://api.openai.com/v1/models',
        capabilities: openAIModelCapabilities(id),
      }));
    return { attempted: true, ok: true, models, error: null };
  } catch (error) { return failure(error); }
}

export async function discoverAnthropicModels(apiKey, fetchImpl = fetch) {
  if (!clean(apiKey)) return failure('credential unavailable', false);
  try {
    const body = await fetchJson(fetchImpl, 'https://api.anthropic.com/v1/models?limit=1000', {
      headers: {
        'x-api-key': clean(apiKey),
        'anthropic-version': '2023-06-01',
      },
    });
    const models = (Array.isArray(body?.data) ? body.data : [])
      .map((row) => {
        const id = clean(row?.id);
        if (!id) return null;
        return baseRecord('anthropic', id, {
          label: clean(row?.display_name) || id,
          source_url: 'https://api.anthropic.com/v1/models',
          capabilities: { messages: true, function_calling: true, prompt_caching: true },
          metadata: { created_at: row?.created_at || null, type: row?.type || null },
        });
      })
      .filter(Boolean);
    return { attempted: true, ok: true, models, error: null };
  } catch (error) { return failure(error); }
}

export async function discoverGeminiModels(apiKey, fetchImpl = fetch) {
  if (!clean(apiKey)) return failure('credential unavailable', false);
  try {
    const body = await fetchJson(
      fetchImpl,
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(clean(apiKey))}`,
      {},
    );
    const models = (Array.isArray(body?.models) ? body.models : [])
      .filter((row) => (row?.supportedGenerationMethods || []).includes('generateContent'))
      .map((row) => {
        const id = clean(row?.baseModelId || row?.name).replace(/^models\//, '');
        if (!id) return null;
        return baseRecord('gemini', id, {
          label: clean(row?.displayName) || id,
          context_window: positiveInt(row?.inputTokenLimit),
          max_output_tokens: positiveInt(row?.outputTokenLimit),
          reasoning_efforts: row?.thinking === true ? ['auto', 'low', 'medium', 'high'] : ['auto'],
          source_url: 'https://generativelanguage.googleapis.com/v1beta/models',
          capabilities: {
            generate_content: true,
            function_calling: true,
            thinking: row?.thinking === true,
          },
          metadata: {
            version: row?.version || null,
            supported_generation_methods: row?.supportedGenerationMethods || [],
          },
        });
      })
      .filter(Boolean);
    return { attempted: true, ok: true, models, error: null };
  } catch (error) { return failure(error); }
}

function xaiPricing(row) {
  const input = Number(row?.prompt_text_token_price);
  const cached = Number(row?.cached_prompt_text_token_price);
  const output = Number(row?.completion_text_token_price);
  if (![input, output].every(Number.isFinite)) return null;
  // xAI model API prices are returned in nanos per token. Convert to USD / million tokens.
  const nanosToPerMillionUsd = (nanos) => Number.isFinite(nanos) ? nanos / 1000 : 0;
  return Object.freeze({
    currency: 'USD',
    unit: 'per_million_tokens',
    input: nanosToPerMillionUsd(input),
    cached_input: nanosToPerMillionUsd(cached),
    cache_write: nanosToPerMillionUsd(input),
    output: nanosToPerMillionUsd(output),
    thresholds: Object.freeze(
      Number.isFinite(Number(row?.long_context_threshold))
        ? [Object.freeze({
            input_tokens_gt: Number(row.long_context_threshold),
            applies_to_full_request: true,
            multipliers: Object.freeze({
              input: Number(row?.prompt_text_token_price_long_context) / input || 1,
              cached_input: 1,
              cache_write: Number(row?.prompt_text_token_price_long_context) / input || 1,
              output: Number(row?.completion_text_token_price_long_context) / output || 1,
            }),
          })]
        : [],
    ),
    service_tier_multipliers: Object.freeze({ default: 1 }),
    source: 'https://api.x.ai/v1/models',
    as_of: new Date().toISOString().slice(0, 10),
  });
}

export async function discoverXaiModels(apiKey, fetchImpl = fetch) {
  if (!clean(apiKey)) return failure('credential unavailable', false);
  try {
    const body = await fetchJson(fetchImpl, 'https://api.x.ai/v1/models', {
      headers: { authorization: `Bearer ${clean(apiKey)}` },
    });
    const models = (Array.isArray(body?.data) ? body.data : [])
      .map((row) => {
        const id = clean(row?.id);
        if (!id || /image|video|voice|embedding/i.test(id)) return null;
        return baseRecord('grok', id, {
          context_window: positiveInt(row?.context_length),
          pricing: xaiPricing(row),
          source_url: 'https://api.x.ai/v1/models',
          capabilities: { responses: true, function_calling: true, prompt_caching: true },
          metadata: {
            aliases: row?.aliases || [],
            created: row?.created || null,
            owned_by: row?.owned_by || null,
          },
        });
      })
      .filter(Boolean);
    return { attempted: true, ok: true, models, error: null };
  } catch (error) { return failure(error); }
}


export async function discoverCursorModels(apiKey, fetchImpl = fetch) {
  if (!clean(apiKey)) return failure('credential unavailable', false);
  try {
    const body = await fetchJson(fetchImpl, 'https://api.cursor.com/v1/models', {
      headers: { authorization: `Bearer ${clean(apiKey)}` },
    });
    const models = (Array.isArray(body?.items) ? body.items : [])
      .map((row) => {
        const id = clean(row?.id);
        if (!id) return null;
        const params = Array.isArray(row?.parameters) ? row.parameters : [];
        const reasoning = params.find((param) => /reason|thinking/i.test(clean(param?.id)));
        const reasoningEfforts = Array.isArray(reasoning?.values)
          ? reasoning.values.map((entry) => clean(entry?.value)).filter(Boolean)
          : [];
        return baseRecord('cursor', id, {
          label: clean(row?.displayName) || id,
          reasoning_efforts: reasoningEfforts.length ? reasoningEfforts : ['auto'],
          source_url: 'https://api.cursor.com/v1/models',
          capabilities: { cursor_cloud_agent: true, agent_workflow: true },
          metadata: {
            description: clean(row?.description) || null,
            aliases: Array.isArray(row?.aliases) ? row.aliases : [],
            parameters: params,
            variants: Array.isArray(row?.variants) ? row.variants : [],
          },
        });
      })
      .filter(Boolean);
    return { attempted: true, ok: true, models, error: null };
  } catch (error) { return failure(error); }
}

function cloudflareTaskName(task) {
  if (typeof task === 'string') return clean(task);
  if (task && typeof task === 'object') return clean(task.name || task.id);
  return '';
}

export async function discoverCloudflareModels(apiToken, accountId, fetchImpl = fetch) {
  if (!clean(apiToken)) return failure('credential unavailable', false);
  if (!clean(accountId)) return failure('CLOUDFLARE_ACCOUNT_ID is required for Workers AI discovery');
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(clean(accountId))}/ai/models/search`;
    const body = await fetchJson(fetchImpl, url, {
      headers: { authorization: `Bearer ${clean(apiToken)}` },
    });
    if (body?.success === false) throw new Error(clean(body?.errors?.[0]?.message) || 'Cloudflare API error');
    const models = (Array.isArray(body?.result) ? body.result : [])
      .map((row) => {
        const id = clean(row?.name);
        const task = cloudflareTaskName(row?.task);
        if (!id || task.toLowerCase() !== 'text generation') return null;
        return baseRecord('cloudflare', id, {
          label: id,
          source_url: url,
          capabilities: { workers_ai: true },
          metadata: {
            task,
            author: clean(row?.author) || null,
            description: clean(row?.description) || null,
          },
        });
      })
      .filter(Boolean);
    return { attempted: true, ok: true, models, error: null, account_id: clean(accountId) };
  } catch (error) { return failure(error); }
}

export async function discoverProviderModels(provider, credential, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  switch (clean(provider).toLowerCase()) {
    case 'openai': return discoverOpenAIModels(credential?.value, fetchImpl);
    case 'anthropic': return discoverAnthropicModels(credential?.value, fetchImpl);
    case 'gemini': return discoverGeminiModels(credential?.value, fetchImpl);
    case 'grok':
    case 'xai': return discoverXaiModels(credential?.value, fetchImpl);
    case 'cursor': return discoverCursorModels(credential?.value, fetchImpl);
    case 'cloudflare': return discoverCloudflareModels(credential?.value, credential?.account_id, fetchImpl);
    default: return failure(`unsupported provider: ${provider}`, false);
  }
}
