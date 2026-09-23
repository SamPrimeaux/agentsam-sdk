export const MODEL_CATALOG_SCHEMA = 'agentsam-model-catalog-v1';

const DOCS = Object.freeze({
  gpt6Astra: 'https://developers.openai.com/api/docs/models/gpt-6-astra',
  gpt6Sol: 'https://developers.openai.com/api/docs/models/gpt-6-sol',
  gpt6Luna: 'https://developers.openai.com/api/docs/models/gpt-6-luna',
  gpt56Sol: 'https://developers.openai.com/api/docs/models/gpt-5.6-sol',
  gpt56Terra: 'https://developers.openai.com/api/docs/models/gpt-5.6-terra',
  gpt56Luna: 'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
  gpt53Codex: 'https://developers.openai.com/api/docs/models/gpt-5.3-codex',
  embeddingLarge: 'https://developers.openai.com/api/docs/models/text-embedding-3-large',
  embeddingSmall: 'https://developers.openai.com/api/docs/models/text-embedding-3-small',
});

const LONG_CONTEXT_POLICY = Object.freeze({
  target_input_tokens: 120_000,
  compact_at_tokens: 180_000,
  intervene_at_tokens: 220_000,
  max_normal_input_tokens: 250_000,
  pricing_threshold_tokens: 272_000,
  max_cumulative_input_tokens: 544_000,
  safety_margin_tokens: 22_000,
});

const FULL_RESPONSES_TOOLS = Object.freeze({
  web_search: true,
  file_search: true,
  image_generation: true,
  code_interpreter: true,
  hosted_shell: true,
  apply_patch: true,
  skills: true,
  computer_use: true,
  mcp: true,
  tool_search: true,
});

const STANDARD_AGENT_CAPABILITIES = Object.freeze({
  agent_runtime: true,
  responses: true,
  streaming: true,
  function_calling: true,
  structured_outputs: true,
  prompt_caching: true,
  compaction: true,
  batch: true,
  fast: true,
  flex: true,
  ...FULL_RESPONSES_TOOLS,
});

function freezePricing({ input, cachedInput, cacheWrite, output, source, longContext = true, processing = true }) {
  return Object.freeze({
    currency: 'USD',
    unit: 'per_million_tokens',
    input,
    cached_input: cachedInput,
    cache_write: cacheWrite,
    output,
    thresholds: Object.freeze(longContext ? [
      Object.freeze({
        input_tokens_gt: 272_000,
        applies_to_full_request: true,
        multipliers: Object.freeze({ input: 2, cached_input: 2, cache_write: 2, output: 1.5 }),
      }),
    ] : []),
    service_tier_multipliers: Object.freeze(processing
      ? { default: 1, fast: 2, flex: 0.5, batch: 0.5 }
      : { default: 1 }),
    source,
    as_of: '2026-09-23',
  });
}

function openAiAgentModel({
  id,
  label,
  source,
  reasoning,
  contextWindow,
  maxOutputTokens,
  knowledgeCutoff,
  description,
  pricing,
  capabilities = {},
  serviceTiers = ['default', 'fast', 'flex'],
  contextPolicy = LONG_CONTEXT_POLICY,
}) {
  return Object.freeze({
    schema_version: 1,
    model_key: 'openai:' + id,
    provider: 'openai',
    provider_model_id: id,
    label,
    kind: 'language',
    description,
    context_window: contextWindow,
    max_output_tokens: maxOutputTokens,
    knowledge_cutoff: knowledgeCutoff,
    reasoning_efforts: Object.freeze([...reasoning]),
    default_reasoning_effort: reasoning.includes('medium') ? 'medium' : reasoning[0],
    service_tiers: Object.freeze([...serviceTiers]),
    capabilities: Object.freeze({ ...STANDARD_AGENT_CAPABILITIES, ...capabilities }),
    pricing,
    context_policy: contextPolicy,
    batch: Object.freeze({
      supported: true,
      completion_window: '24h',
      relative_price: 0.5,
      interactive: false,
    }),
    source: Object.freeze({ url: source, as_of: '2026-09-23' }),
  });
}

function openAiEmbeddingModel({ id, label, source, dimensions, price }) {
  return Object.freeze({
    schema_version: 1,
    model_key: 'openai:' + id,
    provider: 'openai',
    provider_model_id: id,
    label,
    kind: 'embedding',
    description: 'Text embedding model for semantic search and retrieval.',
    context_window: 8_192,
    max_output_tokens: null,
    knowledge_cutoff: null,
    reasoning_efforts: Object.freeze([]),
    default_reasoning_effort: null,
    service_tiers: Object.freeze(['default']),
    capabilities: Object.freeze({
      agent_runtime: false,
      responses: false,
      function_calling: false,
      embeddings: true,
      configurable_dimensions: true,
    }),
    pricing: freezePricing({
      input: price,
      cachedInput: 0,
      cacheWrite: 0,
      output: 0,
      source,
      longContext: false,
      processing: false,
    }),
    context_policy: null,
    batch: Object.freeze({ supported: true, completion_window: '24h', relative_price: 0.5, interactive: false }),
    source: Object.freeze({ url: source, as_of: '2026-09-23' }),
    metadata: Object.freeze({ default_dimensions: dimensions, max_input_tokens: 8_192 }),
  });
}

const GPT_6_ASTRA = openAiAgentModel({
  id: 'gpt-6-astra',
  label: 'GPT-6 Astra',
  source: DOCS.gpt6Astra,
  reasoning: ['low', 'medium', 'high', 'xhigh', 'max'],
  contextWindow: 1_050_000,
  maxOutputTokens: 128_000,
  knowledgeCutoff: '2026-04-30',
  description: 'Highest-capability GPT-6 tier for the hardest end-to-end work.',
  pricing: freezePricing({ input: 10, cachedInput: 1, cacheWrite: 12.5, output: 50, source: DOCS.gpt6Astra }),
  capabilities: { async_tool_calls: true, mid_turn_steering: true, configuration_update: true },
});

const GPT_6_SOL = openAiAgentModel({
  id: 'gpt-6-sol',
  label: 'GPT-6 Sol',
  source: DOCS.gpt6Sol,
  reasoning: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  contextWindow: 1_050_000,
  maxOutputTokens: 128_000,
  knowledgeCutoff: '2026-04-20',
  description: 'GPT-6 tier for complex coding and agentic workflows.',
  pricing: freezePricing({ input: 2, cachedInput: 0.2, cacheWrite: 2.5, output: 10, source: DOCS.gpt6Sol }),
  capabilities: { async_tool_calls: true, mid_turn_steering: true, configuration_update: true },
});

const GPT_6_LUNA = openAiAgentModel({
  id: 'gpt-6-luna',
  label: 'GPT-6 Luna',
  source: DOCS.gpt6Luna,
  reasoning: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  contextWindow: 1_050_000,
  maxOutputTokens: 128_000,
  knowledgeCutoff: '2026-05-18',
  description: 'Most efficient GPT-6 tier for focused, high-volume tasks.',
  pricing: freezePricing({ input: 0.1, cachedInput: 0.01, cacheWrite: 0.125, output: 0.5, source: DOCS.gpt6Luna }),
  capabilities: { async_tool_calls: true, mid_turn_steering: true, configuration_update: true },
});

const GPT_56_SOL = openAiAgentModel({
  id: 'gpt-5.6-sol',
  label: 'GPT-5.6 Sol',
  source: DOCS.gpt56Sol,
  reasoning: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  contextWindow: 1_050_000,
  maxOutputTokens: 128_000,
  knowledgeCutoff: '2026-02-16',
  description: 'Flagship GPT-5.6 model for complex professional work.',
  pricing: freezePricing({ input: 4, cachedInput: 0.4, cacheWrite: 5, output: 20, source: DOCS.gpt56Sol }),
});

const GPT_56_TERRA = openAiAgentModel({
  id: 'gpt-5.6-terra',
  label: 'GPT-5.6 Terra',
  source: DOCS.gpt56Terra,
  reasoning: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  contextWindow: 1_050_000,
  maxOutputTokens: 128_000,
  knowledgeCutoff: '2026-02-16',
  description: 'GPT-5.6 tier balancing intelligence and cost.',
  pricing: freezePricing({ input: 2, cachedInput: 0.2, cacheWrite: 2.5, output: 12, source: DOCS.gpt56Terra }),
});

const GPT_56_LUNA = openAiAgentModel({
  id: 'gpt-5.6-luna',
  label: 'GPT-5.6 Luna',
  source: DOCS.gpt56Luna,
  reasoning: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  contextWindow: 1_050_000,
  maxOutputTokens: 128_000,
  knowledgeCutoff: '2026-02-16',
  description: 'Cost-sensitive GPT-5.6 tier for high-volume workloads.',
  pricing: freezePricing({ input: 0.2, cachedInput: 0.02, cacheWrite: 0.25, output: 1.2, source: DOCS.gpt56Luna }),
});

const GPT_53_CODEX = openAiAgentModel({
  id: 'gpt-5.3-codex',
  label: 'GPT-5.3-Codex',
  source: DOCS.gpt53Codex,
  reasoning: ['low', 'medium', 'high', 'xhigh'],
  contextWindow: 400_000,
  maxOutputTokens: 128_000,
  knowledgeCutoff: '2025-08-31',
  description: 'Agentic coding model for Codex-style software workflows.',
  pricing: freezePricing({
    input: 1.75,
    cachedInput: 0.175,
    cacheWrite: 0,
    output: 14,
    source: DOCS.gpt53Codex,
    longContext: false,
    processing: false,
  }),
  capabilities: {
    web_search: false,
    file_search: false,
    image_generation: false,
    code_interpreter: false,
    hosted_shell: false,
    apply_patch: false,
    skills: false,
    computer_use: false,
    mcp: false,
    tool_search: false,
    async_tool_calls: false,
    mid_turn_steering: false,
    configuration_update: false,
    fast: false,
    flex: false,
  },
  serviceTiers: ['default'],
  contextPolicy: Object.freeze({
    target_input_tokens: 100_000,
    compact_at_tokens: 160_000,
    intervene_at_tokens: 210_000,
    max_normal_input_tokens: 240_000,
    pricing_threshold_tokens: null,
    max_cumulative_input_tokens: 400_000,
    safety_margin_tokens: 20_000,
  }),
});

const TEXT_EMBEDDING_3_LARGE = openAiEmbeddingModel({
  id: 'text-embedding-3-large',
  label: 'text-embedding-3-large',
  source: DOCS.embeddingLarge,
  dimensions: 3_072,
  price: 0.13,
});

const TEXT_EMBEDDING_3_SMALL = openAiEmbeddingModel({
  id: 'text-embedding-3-small',
  label: 'text-embedding-3-small',
  source: DOCS.embeddingSmall,
  dimensions: 1_536,
  price: 0.02,
});

export const MODEL_CATALOG = Object.freeze([
  GPT_6_LUNA,
  GPT_6_SOL,
  GPT_6_ASTRA,
  GPT_56_LUNA,
  GPT_56_TERRA,
  GPT_56_SOL,
  GPT_53_CODEX,
  TEXT_EMBEDDING_3_LARGE,
  TEXT_EMBEDDING_3_SMALL,
]);

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function nonNegativeInteger(value, label) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new RangeError(`${label} must be a non-negative number`);
  return Math.floor(number);
}

export function listModelCatalog(options = {}) {
  const provider = clean(options.provider).toLowerCase();
  return MODEL_CATALOG.filter((row) => !provider || row.provider === provider);
}

export function getModelRecord(value) {
  const key = clean(value);
  if (!key) return null;
  return MODEL_CATALOG.find((row) => row.model_key === key || row.provider_model_id === key) || null;
}

export function mergeModelReference(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const reference = getModelRecord(snapshot.model_key || snapshot.provider_model_id);
  if (!reference) return snapshot;

  const providerContext = snapshot.context_window_source === 'provider_api'
    && Number.isFinite(Number(snapshot.context_window))
    && Number(snapshot.context_window) > 0;
  const providerMaxOutput = snapshot.max_output_tokens_source === 'provider_api'
    && Number.isFinite(Number(snapshot.max_output_tokens))
    && Number(snapshot.max_output_tokens) > 0;

  return Object.freeze({
    ...snapshot,
    ...reference,
    model_key: snapshot.model_key || reference.model_key,
    provider: snapshot.provider || reference.provider,
    provider_model_id: snapshot.provider_model_id || reference.provider_model_id,
    availability: snapshot.availability,
    availability_source: snapshot.availability_source,
    context_window: providerContext ? Number(snapshot.context_window) : reference.context_window ?? snapshot.context_window ?? null,
    context_window_source: providerContext
      ? 'provider_api'
      : reference.context_window ? 'sdk_reference' : snapshot.context_window_source || 'unknown',
    max_output_tokens: providerMaxOutput ? Number(snapshot.max_output_tokens) : reference.max_output_tokens ?? snapshot.max_output_tokens ?? null,
    max_output_tokens_source: providerMaxOutput
      ? 'provider_api'
      : reference.max_output_tokens ? 'sdk_reference' : snapshot.max_output_tokens_source || 'unknown',
    reasoning_efforts: reference.reasoning_efforts?.length
      ? reference.reasoning_efforts
      : snapshot.reasoning_efforts || Object.freeze(['auto']),
    default_reasoning_effort: reference.default_reasoning_effort || snapshot.default_reasoning_effort || null,
    service_tiers: reference.service_tiers?.length ? reference.service_tiers : snapshot.service_tiers || Object.freeze(['default']),
    capabilities: Object.freeze({ ...(snapshot.capabilities || {}), ...(reference.capabilities || {}) }),
    pricing: reference.pricing || snapshot.pricing || null,
    context_policy: reference.context_policy || snapshot.context_policy || null,
    source: reference.source || snapshot.source || null,
    metadata: Object.freeze({ ...(snapshot.metadata || {}), ...(reference.metadata || {}) }),
  });
}

export function calculateModelCost(model, usage = {}, options = {}) {
  const record = typeof model === 'string' ? getModelRecord(model) : model;
  if (!record?.pricing) throw new TypeError('model pricing record is required');

  const totalInput = nonNegativeInteger(usage.input_tokens ?? usage.inputTokens, 'input_tokens');
  const cachedInput = Math.min(totalInput, nonNegativeInteger(usage.cached_input_tokens ?? usage.cachedInputTokens, 'cached_input_tokens'));
  const cacheWrite = Math.min(totalInput - cachedInput, nonNegativeInteger(usage.cache_write_tokens ?? usage.cacheWriteTokens, 'cache_write_tokens'));
  const uncachedInput = Math.max(0, totalInput - cachedInput - cacheWrite);
  const output = nonNegativeInteger(usage.output_tokens ?? usage.outputTokens, 'output_tokens');
  const serviceTier = clean(options.serviceTier || usage.service_tier || usage.serviceTier || 'default') || 'default';
  const tierMultiplier = record.pricing.service_tier_multipliers?.[serviceTier];
  if (!Number.isFinite(tierMultiplier)) throw new RangeError(`unsupported service tier for ${record.provider_model_id}: ${serviceTier}`);

  const threshold = (record.pricing.thresholds || []).find((row) => totalInput > row.input_tokens_gt) || null;
  const thresholdMultipliers = threshold?.multipliers || {};
  const rates = {
    input: record.pricing.input * (thresholdMultipliers.input || 1) * tierMultiplier,
    cached_input: record.pricing.cached_input * (thresholdMultipliers.cached_input || 1) * tierMultiplier,
    cache_write: record.pricing.cache_write * (thresholdMultipliers.cache_write || 1) * tierMultiplier,
    output: record.pricing.output * (thresholdMultipliers.output || 1) * tierMultiplier,
  };
  const components = {
    input: (uncachedInput * rates.input) / 1_000_000,
    cached_input: (cachedInput * rates.cached_input) / 1_000_000,
    cache_write: (cacheWrite * rates.cache_write) / 1_000_000,
    output: (output * rates.output) / 1_000_000,
  };
  const total = Object.values(components).reduce((sum, value) => sum + value, 0);

  return Object.freeze({
    model_key: record.model_key,
    service_tier: serviceTier,
    usage: Object.freeze({
      input_tokens: totalInput,
      uncached_input_tokens: uncachedInput,
      cached_input_tokens: cachedInput,
      cache_write_tokens: cacheWrite,
      output_tokens: output,
    }),
    threshold_applied: threshold ? Object.freeze({ ...threshold }) : null,
    rates_per_million: Object.freeze(rates),
    components_usd: Object.freeze(components),
    total_usd: total,
    estimate_kind: usage.estimate_kind === 'provider' ? 'provider' : 'local',
    pricing_source: record.pricing.source,
    pricing_as_of: record.pricing.as_of,
  });
}
