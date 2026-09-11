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

export function createContextBudget(options = {}) {
  const windowTokens = positiveInteger(options.windowTokens, 'windowTokens');
  const charsPerToken = positiveNumber(options.charsPerToken ?? DEFAULT_CONTEXT_RATIOS.charsPerToken, 'charsPerToken');
  const targetInputRatio = ratio(options.targetInputRatio ?? DEFAULT_CONTEXT_RATIOS.targetInputRatio, 'targetInputRatio');
  const hardInputRatio = ratio(options.hardInputRatio ?? DEFAULT_CONTEXT_RATIOS.hardInputRatio, 'hardInputRatio');
  if (targetInputRatio >= hardInputRatio) throw new RangeError('targetInputRatio must be lower than hardInputRatio');

  const windowChars = Math.floor(windowTokens * charsPerToken);
  const targetInputTokens = Math.floor(windowTokens * targetInputRatio);
  const hardInputTokens = Math.floor(windowTokens * hardInputRatio);
  const targetInputChars = Math.floor(windowChars * targetInputRatio);
  const hardInputChars = Math.floor(windowChars * hardInputRatio);

  return Object.freeze({
    windowTokens,
    windowChars,
    charsPerToken,
    targetInputRatio,
    hardInputRatio,
    targetInputTokens,
    hardInputTokens,
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
