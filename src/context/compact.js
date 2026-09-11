import { normalizeContextItem } from './resolve.js';

export const DEFAULT_CONSUMED_CONTEXT_CHARS = 4_000;

export function compactContextItem(value, options = {}) {
  const item = normalizeContextItem(value);
  const maxChars = Number(options.maxChars ?? DEFAULT_CONSUMED_CONTEXT_CHARS);
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new RangeError('compact maxChars must be a positive integer');
  if (item.content.length <= maxChars) return Object.freeze({ ...item, compacted: false });
  const content = `${item.content.slice(0, Math.max(0, maxChars - 1))}…`;
  return Object.freeze({
    ...item,
    content,
    chars: content.length,
    compacted: true,
    source_chars: item.content.length,
  });
}

export function compactConsumedToolResult(value, options = {}) {
  const ref = String(options.ref || value?.ref || 'tool_result:consumed').trim();
  const hash = options.hash || value?.hash;
  const priority = Number.isFinite(options.priority) ? options.priority : Number(value?.priority || 0);
  const content = typeof value === 'string'
    ? value
    : String(value?.content ?? JSON.stringify(value?.content ?? value ?? null));
  return compactContextItem({ ref, kind: 'tool_result', hash, priority, content }, options);
}
