import { createContextBudget, estimateContextTokens } from './budget.js';
import { loadProjectRules } from '../lib/project-rules.js';

export const CONTEXT_ITEM_KINDS = Object.freeze(['file', 'symbol', 'memory', 'tool_result', 'repo', 'artifact']);

function clean(value) { return value == null ? '' : String(value).trim(); }

export function normalizeContextItem(value = {}) {
  const ref = clean(value.ref);
  if (!ref) throw new TypeError('ContextItem.ref is required');
  const kind = clean(value.kind);
  if (!CONTEXT_ITEM_KINDS.includes(kind)) throw new RangeError(`ContextItem.kind must be one of: ${CONTEXT_ITEM_KINDS.join(', ')}`);
  const content = value.content == null ? '' : String(value.content);
  const chars = Number.isInteger(value.chars) && value.chars >= 0 ? value.chars : content.length;
  const priority = Number.isFinite(value.priority) ? Number(value.priority) : 0;
  return Object.freeze({ ref, kind, chars, hash: clean(value.hash) || undefined, priority, content });
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

  let evidenceChars = 0;
  let fileChars = 0;
  const included = [];
  const deferred = [];

  for (const row of candidates) {
    const item = row.item;
    const remainingEvidence = budget.maxEvidenceChars - evidenceChars;
    if (remainingEvidence <= 0) { deferred.push(item.ref); continue; }
    const kindCap = capForKind(item, budget);
    const remainingFile = item.kind === 'file' ? budget.maxFileCharsPerTurn - fileChars : Number.POSITIVE_INFINITY;
    const allowed = Math.floor(Math.min(kindCap, remainingEvidence, remainingFile));
    if (allowed <= 0) { deferred.push(item.ref); continue; }
    const clipped = truncate(item.content, allowed);
    const next = Object.freeze({ ...item, content: clipped.content, chars: clipped.content.length, truncated: clipped.truncated || item.chars > clipped.content.length });
    included.push(next);
    evidenceChars += next.chars;
    if (item.kind === 'file') fileChars += next.chars;
    if (clipped.truncated) deferred.push(`${item.ref}#remainder`);
  }

  const systemChars = options.rules?.content ? String(options.rules.content).length : 0;
  const totalChars = systemChars + evidenceChars;
  return Object.freeze({
    objective,
    refs: Object.freeze(refs),
    rules: options.rules || null,
    items: Object.freeze(included),
    budget,
    receipt: Object.freeze({
      chars: totalChars,
      evidence_chars: evidenceChars,
      system_chars: systemChars,
      estimated_tokens: estimateContextTokens(totalChars, budget.charsPerToken),
      sources_considered: candidates.length,
      sources_included: included.length,
      sources_deferred: deferred.length,
      deferred_refs: Object.freeze(deferred),
    }),
  });
}

export function resolveProjectContext(options = {}) {
  const budget = options.budget?.windowTokens ? options.budget : createContextBudget(options.budget || {});
  const rules = loadProjectRules(options.cwd || process.cwd(), { maxChars: Math.min(24_000, budget.maxSystemChars) });
  return resolveContext({ ...options, budget, rules });
}
