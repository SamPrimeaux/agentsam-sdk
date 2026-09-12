export const MODEL_CATALOG_SCHEMA = 'agentsam-model-catalog-v1';

const ASTRA_SOURCE = 'https://developers.openai.com/api/docs/models/gpt-6-astra';

const GPT_6_ASTRA = Object.freeze({
  schema_version: 1,
  model_key: 'openai:gpt-6-astra',
  provider: 'openai',
  provider_model_id: 'gpt-6-astra',
  label: 'GPT-6 Astra',
  context_window: 1_050_000,
  max_output_tokens: 128_000,
  reasoning_efforts: Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']),
  service_tiers: Object.freeze(['default', 'fast', 'flex']),
  capabilities: Object.freeze({
    responses: true,
    streaming: true,
    function_calling: true,
    structured_outputs: true,
    prompt_caching: true,
    compaction: true,
    tool_search: true,
    async_tool_calls: true,
    mid_turn_steering: true,
    configuration_update: true,
    batch: true,
    fast: true,
    flex: true,
  }),
  pricing: Object.freeze({
    currency: 'USD',
    unit: 'per_million_tokens',
    input: 10,
    cached_input: 1,
    cache_write: 12.5,
    output: 50,
    thresholds: Object.freeze([
      Object.freeze({
        input_tokens_gt: 272_000,
        applies_to_full_request: true,
        multipliers: Object.freeze({ input: 2, cached_input: 2, cache_write: 2, output: 1.5 }),
      }),
    ]),
    service_tier_multipliers: Object.freeze({ default: 1, fast: 2, flex: 0.5, batch: 0.5 }),
    source: ASTRA_SOURCE,
    as_of: '2026-09-12',
  }),
  context_policy: Object.freeze({
    target_input_tokens: 120_000,
    compact_at_tokens: 180_000,
    intervene_at_tokens: 220_000,
    max_normal_input_tokens: 250_000,
    pricing_threshold_tokens: 272_000,
    safety_margin_tokens: 22_000,
  }),
  batch: Object.freeze({
    supported: true,
    completion_window: '24h',
    relative_price: 0.5,
    interactive: false,
  }),
  source: Object.freeze({ url: ASTRA_SOURCE, as_of: '2026-09-12' }),
});

export const MODEL_CATALOG = Object.freeze([GPT_6_ASTRA]);

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
