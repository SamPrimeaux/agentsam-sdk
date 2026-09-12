import { assessContextUsage, createContextBudget, estimateContextTokens } from './budget.js';
import { compileAgentInstructions } from '../lib/agent-instructions.js';

export const CONTEXT_ITEM_KINDS = Object.freeze(['file', 'symbol', 'memory', 'tool_result', 'repo', 'artifact']);

function clean(value) { return value == null ? '' : String(value).trim(); }
function nonNegativeInteger(value) { return Number.isInteger(value) && value >= 0 ? value : 0; }

export function normalizeContextItem(value = {}) {
  const ref = clean(value.ref);
  if (!ref) throw new TypeError('ContextItem.ref is required');
  const kind = clean(value.kind);
  if (!CONTEXT_ITEM_KINDS.includes(kind)) throw new RangeError(`ContextItem.kind must be one of: ${CONTEXT_ITEM_KINDS.join(', ')}`);
  const content = value.content == null ? '' : String(value.content);
  const chars = Number.isInteger(value.chars) && value.chars >= 0 ? value.chars : content.length;
  const priority = Number.isFinite(value.priority) ? Number(value.priority) : 0;
  return Object.freeze({
    ref,
    kind,
    chars,
    hash: clean(value.hash) || undefined,
    priority,
    content,
    ...(value.truncated === true ? { truncated: true } : {}),
    ...(value.compacted === true ? { compacted: true } : {}),
    ...(Number.isInteger(value.source_chars) && value.source_chars >= chars ? { source_chars: value.source_chars } : {}),
  });
}

function capForKind(item, budget) {
  if (item.kind === 'file') return budget.maxFileCharsPerRead;
  if (item.kind === 'tool_result') return budget.maxToolResultChars;
  return budget.maxEvidenceChars;
}

function truncate(content, maxChars) {
  if (content.length <= maxChars) return { content, truncated: false };
  return { content: `${content.slice(0, Math.max(0, maxChars - 1))}…`, truncated: true };
}

export function resolveContext(options = {}) {
  const objective = clean(options.objective);
  if (!objective) throw new TypeError('context.resolve objective is required');
  const budget = options.budget?.windowTokens ? options.budget : createContextBudget(options.budget || {});
  const refs = [...new Set((options.refs || []).map(clean).filter(Boolean))];
  const candidates = (options.items || []).map((item, index) => ({ item: normalizeContextItem(item), index }));
  candidates.sort((a, b) => (b.item.priority - a.item.priority) || (a.index - b.index));

  let selectedChars = 0;
  let fileChars = 0;
  const included = [];
  const deferred = [];

  for (const row of candidates) {
    const item = row.item;
    const remainingEvidence = budget.maxEvidenceChars - selectedChars;
    if (remainingEvidence <= 0) { deferred.push(item.ref); continue; }
    const kindCap = capForKind(item, budget);
    const remainingFile = item.kind === 'file' ? budget.maxFileCharsPerTurn - fileChars : Number.POSITIVE_INFINITY;
    const allowed = Math.floor(Math.min(kindCap, remainingEvidence, remainingFile));
    if (allowed <= 0) { deferred.push(item.ref); continue; }
    const clipped = truncate(item.content, allowed);
    const next = Object.freeze({ ...item, content: clipped.content, chars: clipped.content.length, truncated: clipped.truncated || item.truncated === true || item.chars > clipped.content.length });
    included.push(next);
    selectedChars += next.chars;
    if (item.kind === 'file') fileChars += next.chars;
    if (clipped.truncated) deferred.push(`${item.ref}#remainder`);
  }

  const ruleChars = options.rules?.content ? String(options.rules.content).length : 0;
  const instructionChars = ruleChars + nonNegativeInteger(options.instructionChars);
  const toolSchemaChars = nonNegativeInteger(options.toolSchemaChars);
  const historyChars = nonNegativeInteger(options.historyChars);
  const toolResultChars = included.filter((item) => item.kind === 'tool_result').reduce((sum, item) => sum + item.chars, 0);
  const evidenceChars = selectedChars - toolResultChars;
  const totalChars = instructionChars + toolSchemaChars + historyChars + evidenceChars + toolResultChars;
  const estimatedInputTokens = estimateContextTokens(totalChars, budget.charsPerToken);
  const pressure = assessContextUsage(estimatedInputTokens, budget);
  const rehydratable = [...new Set(included.filter((item) => item.ref).map((item) => item.ref))];

  return Object.freeze({
    objective,
    refs: Object.freeze(refs),
    rules: options.rules || null,
    items: Object.freeze(included),
    budget,
    receipt: Object.freeze({
      chars: totalChars,
      system_chars: instructionChars,
      instruction_chars: instructionChars,
      tool_schema_chars: toolSchemaChars,
      history_chars: historyChars,
      evidence_chars: evidenceChars,
      tool_result_chars: toolResultChars,
      estimated_tokens: estimatedInputTokens,
      estimated_input_tokens: estimatedInputTokens,
      window_tokens: budget.windowTokens,
      utilization_ratio: pressure.utilizationRatio,
      pricing_threshold_tokens: pressure.pricingThresholdTokens,
      tokens_until_pricing_threshold: pressure.tokensUntilPricingThreshold,
      pressure: pressure.stage,
      estimate_kind: 'local',
      sources_considered: candidates.length,
      sources_included: included.length,
      sources_deferred: deferred.length,
      deferred_refs: Object.freeze(deferred),
      rehydratable_refs: Object.freeze(rehydratable),
    }),
  });
}

export function resolveProjectContext(options = {}) {
  const budget = options.budget?.windowTokens ? options.budget : createContextBudget(options.budget || {});
  const rules = compileAgentInstructions(options.cwd || process.cwd(), { maxChars: Math.min(24_000, budget.maxSystemChars) });
  return resolveContext({ ...options, budget, rules });
}
