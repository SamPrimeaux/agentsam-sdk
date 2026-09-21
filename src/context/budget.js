export const DEFAULT_CONTEXT_RATIOS = Object.freeze({
  targetInputRatio: 0.60,
  hardInputRatio: 0.85,
  charsPerToken: 4,
});

function ratio(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1) throw new RangeError(`${label} must be > 0 and <= 1`);
  return value;
}

function positiveNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive`);
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${label} must be a positive integer`);
  return value;
}

function nullablePositiveInteger(value, label) {
  if (value == null) return null;
  return positiveInteger(value, label);
}

export function createContextBudget(options = {}) {
  const windowTokens = positiveInteger(options.windowTokens, 'windowTokens');
  const charsPerToken = positiveNumber(options.charsPerToken ?? DEFAULT_CONTEXT_RATIOS.charsPerToken, 'charsPerToken');
  const targetInputRatio = ratio(
    options.targetInputRatio ?? (options.targetInputTokens ? options.targetInputTokens / windowTokens : DEFAULT_CONTEXT_RATIOS.targetInputRatio),
    'targetInputRatio',
  );
  const hardInputRatio = ratio(
    options.hardInputRatio ?? options.hardWindowRatio ?? (options.hardInputTokens ? options.hardInputTokens / windowTokens : DEFAULT_CONTEXT_RATIOS.hardInputRatio),
    'hardInputRatio',
  );
  if (targetInputRatio >= hardInputRatio) throw new RangeError('targetInputRatio must be lower than hardInputRatio');

  const windowChars = Math.floor(windowTokens * charsPerToken);
  const targetInputTokens = positiveInteger(options.targetInputTokens ?? Math.floor(windowTokens * targetInputRatio), 'targetInputTokens');
  const hardInputTokens = positiveInteger(options.hardInputTokens ?? Math.floor(windowTokens * hardInputRatio), 'hardInputTokens');
  if (targetInputTokens >= hardInputTokens) throw new RangeError('targetInputTokens must be lower than hardInputTokens');

  const maxNormalInputTokens = positiveInteger(options.maxNormalInputTokens ?? hardInputTokens, 'maxNormalInputTokens');
  if (maxNormalInputTokens > hardInputTokens) throw new RangeError('maxNormalInputTokens must not exceed hardInputTokens');
  const compactAtTokens = positiveInteger(
    options.compactAtTokens ?? Math.floor(targetInputTokens + ((maxNormalInputTokens - targetInputTokens) * 0.4)),
    'compactAtTokens',
  );
  const interveneAtTokens = positiveInteger(
    options.interveneAtTokens ?? Math.floor(targetInputTokens + ((maxNormalInputTokens - targetInputTokens) * 0.72)),
    'interveneAtTokens',
  );
  if (!(targetInputTokens <= compactAtTokens && compactAtTokens <= interveneAtTokens && interveneAtTokens <= maxNormalInputTokens)) {
    throw new RangeError('context policy must satisfy target <= compactAt <= interveneAt <= maxNormal');
  }

  const pricingThresholdTokens = nullablePositiveInteger(options.pricingThresholdTokens, 'pricingThresholdTokens');
  const maxCumulativeInputTokens = positiveInteger(
    options.maxCumulativeInputTokens
      ?? (pricingThresholdTokens ? pricingThresholdTokens * 2 : maxNormalInputTokens * 4),
    'maxCumulativeInputTokens',
  );
  const safetyMarginTokens = Number.isInteger(options.safetyMarginTokens) && options.safetyMarginTokens >= 0
    ? options.safetyMarginTokens
    : pricingThresholdTokens && pricingThresholdTokens > maxNormalInputTokens
      ? pricingThresholdTokens - maxNormalInputTokens
      : 0;
  const targetInputChars = Math.floor(targetInputTokens * charsPerToken);
  const hardInputChars = Math.floor(hardInputTokens * charsPerToken);

  return Object.freeze({
    windowTokens,
    windowChars,
    charsPerToken,
    targetInputRatio,
    hardInputRatio,
    hardWindowRatio: hardInputRatio,
    targetInputTokens,
    compactAtTokens,
    interveneAtTokens,
    maxNormalInputTokens,
    hardInputTokens,
    pricingThresholdTokens,
    maxCumulativeInputTokens,
    safetyMarginTokens,
    targetInputChars,
    hardInputChars,
    maxSystemChars: positiveInteger(options.maxSystemChars ?? Math.max(4_000, Math.min(60_000, Math.floor(windowChars * 0.05))), 'maxSystemChars'),
    maxToolSchemaChars: positiveInteger(options.maxToolSchemaChars ?? Math.max(4_000, Math.min(40_000, Math.floor(windowChars * 0.04))), 'maxToolSchemaChars'),
    maxEvidenceChars: positiveInteger(options.maxEvidenceChars ?? Math.max(8_000, Math.min(100_000, Math.floor(targetInputChars * 0.25))), 'maxEvidenceChars'),
    maxFileCharsPerRead: positiveInteger(options.maxFileCharsPerRead ?? 32_768, 'maxFileCharsPerRead'),
    maxFileCharsPerTurn: positiveInteger(options.maxFileCharsPerTurn ?? Math.max(32_768, Math.min(131_072, Math.floor(targetInputChars * 0.25))), 'maxFileCharsPerTurn'),
    maxToolResultChars: positiveInteger(options.maxToolResultChars ?? 24_000, 'maxToolResultChars'),
  });
}

export function estimateContextTokens(chars, charsPerToken = DEFAULT_CONTEXT_RATIOS.charsPerToken) {
  if (!Number.isFinite(chars) || chars < 0) throw new RangeError('chars must be a non-negative number');
  if (!Number.isFinite(charsPerToken) || charsPerToken <= 0) throw new RangeError('charsPerToken must be positive');
  return Math.ceil(chars / charsPerToken);
}

export function assessContextUsage(tokens, budget) {
  const inputTokens = Number(tokens);
  if (!Number.isFinite(inputTokens) || inputTokens < 0) throw new RangeError('tokens must be a non-negative number');
  if (!budget?.windowTokens) throw new TypeError('context budget is required');
  let stage = 'normal';
  if (inputTokens >= budget.hardInputTokens) stage = 'hard';
  else if (inputTokens >= budget.maxNormalInputTokens) stage = 'max-normal';
  else if (inputTokens >= budget.interveneAtTokens) stage = 'intervene';
  else if (inputTokens >= budget.compactAtTokens) stage = 'compact';
  else if (inputTokens >= budget.targetInputTokens) stage = 'target';
  const pricingThresholdTokens = budget.pricingThresholdTokens ?? null;
  return Object.freeze({
    inputTokens: Math.ceil(inputTokens),
    stage,
    utilizationRatio: inputTokens / budget.windowTokens,
    pricingThresholdTokens,
    tokensUntilPricingThreshold: pricingThresholdTokens == null ? null : pricingThresholdTokens - Math.ceil(inputTokens),
    pricingThresholdCrossed: pricingThresholdTokens == null ? false : inputTokens > pricingThresholdTokens,
    shouldCompact: inputTokens >= budget.compactAtTokens,
    shouldIntervene: inputTokens >= budget.interveneAtTokens,
  });
}
