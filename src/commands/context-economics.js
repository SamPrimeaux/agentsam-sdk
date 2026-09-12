import { createContextBudget, assessContextUsage } from '../context/index.js';
import { getModelRecord } from '../models/index.js';
import { readCliPreferences } from '../lib/cli-preferences.js';

function formatInteger(value) {
  return Number(value).toLocaleString('en-US');
}

function percent(value) {
  return `${(Number(value) * 100).toFixed(1)}%`;
}

export function buildContextEconomicsReport(cwd, options = {}) {
  const preferences = options.preferences || readCliPreferences(cwd) || {};
  const model = getModelRecord(preferences.modelPreference);
  if (!model) {
    return Object.freeze({
      model: preferences.modelPreference || 'auto',
      resolved: false,
      reason: 'Select an exact catalog model with /model before Agent Sam can calculate model-specific context economics.',
      reasoning_effort: preferences.reasoningEffort || 'auto',
      service_tier: preferences.serviceTier || 'default',
      active_input_tokens: null,
    });
  }

  const policy = model.context_policy || {};
  const budget = createContextBudget({
    windowTokens: model.context_window,
    targetInputTokens: policy.target_input_tokens,
    compactAtTokens: policy.compact_at_tokens,
    interveneAtTokens: policy.intervene_at_tokens,
    maxNormalInputTokens: policy.max_normal_input_tokens,
    pricingThresholdTokens: policy.pricing_threshold_tokens,
    safetyMarginTokens: policy.safety_margin_tokens,
  });
  const active = Number.isFinite(options.activeInputTokens) && options.activeInputTokens >= 0
    ? Math.floor(options.activeInputTokens)
    : null;
  const pressure = active == null ? null : assessContextUsage(active, budget);

  return Object.freeze({
    model: model.provider_model_id,
    model_key: model.model_key,
    resolved: true,
    reasoning_effort: preferences.reasoningEffort || 'auto',
    service_tier: preferences.serviceTier || 'default',
    active_input_tokens: active,
    estimate_kind: options.estimateKind === 'provider' ? 'provider' : active == null ? null : 'local',
    window_tokens: budget.windowTokens,
    utilization_ratio: pressure?.utilizationRatio ?? null,
    target_input_tokens: budget.targetInputTokens,
    compact_at_tokens: budget.compactAtTokens,
    intervene_at_tokens: budget.interveneAtTokens,
    max_normal_input_tokens: budget.maxNormalInputTokens,
    pricing_threshold_tokens: budget.pricingThresholdTokens,
    tokens_until_pricing_threshold: pressure?.tokensUntilPricingThreshold ?? null,
    pressure: pressure?.stage ?? 'unknown',
    should_compact: pressure?.shouldCompact ?? false,
    should_intervene: pressure?.shouldIntervene ?? false,
    pricing_threshold_crossed: pressure?.pricingThresholdCrossed ?? false,
    batch: model.batch,
    pricing_source: model.pricing?.source || null,
    pricing_as_of: model.pricing?.as_of || null,
  });
}

export function renderContextEconomics(report) {
  if (!report.resolved) {
    return [
      '',
      '  Agent Sam · context',
      `  model            ${report.model}`,
      `  reasoning        ${report.reasoning_effort}`,
      `  processing       ${report.service_tier}`,
      '',
      `  ${report.reason}`,
      '',
    ].join('\n');
  }

  const active = report.active_input_tokens == null
    ? 'unavailable · no provider/local usage snapshot yet'
    : `${report.estimate_kind === 'provider' ? '' : '~'}${formatInteger(report.active_input_tokens)}${report.utilization_ratio == null ? '' : ` · ${percent(report.utilization_ratio)} of window`}`;
  const remaining = report.tokens_until_pricing_threshold == null
    ? 'unavailable until active usage is known'
    : `${report.tokens_until_pricing_threshold < 0 ? '-' : ''}${formatInteger(Math.abs(report.tokens_until_pricing_threshold))}`;
  return [
    '',
    '  Agent Sam · context',
    `  model            ${report.model}`,
    `  reasoning        ${report.reasoning_effort}`,
    `  processing       ${report.service_tier}`,
    '',
    '  Context',
    `    active          ${active}`,
    `    window          ${formatInteger(report.window_tokens)}`,
    '',
    '  Working-set policy',
    `    target          ${formatInteger(report.target_input_tokens)}`,
    `    compact at      ${formatInteger(report.compact_at_tokens)}`,
    `    intervene at    ${formatInteger(report.intervene_at_tokens)}`,
    `    max normal      ${formatInteger(report.max_normal_input_tokens)}`,
    '',
    '  Economics',
    `    price threshold ${formatInteger(report.pricing_threshold_tokens)}`,
    `    remaining       ${remaining}`,
    `    pricing as-of   ${report.pricing_as_of || 'unknown'}`,
    '',
    '  Batch is a separate asynchronous execution lane; it is not an interactive service tier.',
    '  Use `/context repo` for repository/Git bridge context.',
    '',
  ].join('\n');
}
