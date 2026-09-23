import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateModelCost, getModelRecord, mergeModelReference } from '../src/models/index.js';

test('Astra catalog separates technical window, reasoning controls, service tiers, and economics', () => {
  const model = getModelRecord('gpt-6-astra');
  assert.ok(model);
  assert.equal(model.context_window, 1_050_000);
  assert.equal(model.max_output_tokens, 128_000);
  assert.deepEqual(model.reasoning_efforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(model.service_tiers, ['default', 'fast', 'flex']);
  assert.equal(model.context_policy.target_input_tokens, 120_000);
  assert.equal(model.context_policy.compact_at_tokens, 180_000);
  assert.equal(model.context_policy.max_normal_input_tokens, 250_000);
  assert.equal(model.context_policy.pricing_threshold_tokens, 272_000);
  assert.equal(model.batch.interactive, false);
});

test('cost calculation applies the long-context threshold to the full request only after crossing it', () => {
  const atBoundary = calculateModelCost('gpt-6-astra', { input_tokens: 272_000, output_tokens: 10_000 });
  assert.equal(atBoundary.threshold_applied, null);
  assert.equal(atBoundary.rates_per_million.input, 10);
  assert.equal(atBoundary.rates_per_million.output, 50);

  const crossed = calculateModelCost('gpt-6-astra', { input_tokens: 272_001, output_tokens: 10_000 });
  assert.equal(crossed.threshold_applied.input_tokens_gt, 272_000);
  assert.equal(crossed.rates_per_million.input, 20);
  assert.equal(crossed.rates_per_million.output, 75);
  assert.ok(crossed.total_usd > atBoundary.total_usd);
});

test('service tier and cache pricing stay explicit rather than hidden in prompts', () => {
  const usage = { input_tokens: 100_000, cached_input_tokens: 80_000, cache_write_tokens: 10_000, output_tokens: 20_000 };
  const standard = calculateModelCost('gpt-6-astra', usage, { serviceTier: 'default' });
  const fast = calculateModelCost('gpt-6-astra', usage, { serviceTier: 'fast' });
  const flex = calculateModelCost('gpt-6-astra', usage, { serviceTier: 'flex' });
  const batch = calculateModelCost('gpt-6-astra', usage, { serviceTier: 'batch' });
  assert.equal(fast.total_usd, standard.total_usd * 2);
  assert.equal(flex.total_usd, standard.total_usd * 0.5);
  assert.equal(batch.total_usd, standard.total_usd * 0.5);
  assert.equal(standard.rates_per_million.cached_input, 1);
  assert.equal(standard.rates_per_million.cache_write, 12.5);
});


test('GPT-6 Luna reference hydrates a stale provider-verified snapshot without changing availability authority', () => {
  const merged = mergeModelReference({
    model_key: 'openai:gpt-6-luna',
    provider: 'openai',
    provider_model_id: 'gpt-6-luna',
    availability: 'available',
    availability_source: 'provider_api',
    context_window: null,
    context_window_source: 'unknown',
    max_output_tokens: null,
    max_output_tokens_source: 'unknown',
    reasoning_efforts: ['auto'],
    service_tiers: ['default'],
    capabilities: { responses: true },
  });
  assert.equal(merged.availability, 'available');
  assert.equal(merged.availability_source, 'provider_api');
  assert.equal(merged.context_window, 1_050_000);
  assert.equal(merged.context_window_source, 'sdk_reference');
  assert.equal(merged.max_output_tokens, 128_000);
  assert.deepEqual(merged.reasoning_efforts, ['none', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(merged.default_reasoning_effort, 'medium');
  assert.equal(merged.capabilities.responses, true);
  assert.equal(merged.capabilities.function_calling, true);
});
