import { DEFAULT_RESULT_POLICY, normalizeResultPolicy } from '../context/result-policy.js';

function text(value) { return value == null ? '' : String(value).trim(); }

export function toToolCard(tool = {}) {
  const required = Array.isArray(tool.required)
    ? tool.required
    : Array.isArray(tool.input_schema?.required)
      ? tool.input_schema.required
      : [];
  return Object.freeze({
    tool: text(tool.tool || tool.name),
    summary: text(tool.summary || tool.description),
    category: text(tool.category) || undefined,
    risk: text(tool.risk) || 'read',
    required: Object.freeze([...required]),
    result_class: text(tool.result_class) || 'bounded_evidence',
  });
}

function score(card, query) {
  if (!query) return 1;
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const haystack = `${card.tool} ${card.summary} ${card.category || ''}`.toLowerCase();
  let total = 0;
  if (card.tool.toLowerCase() === q) total += 100;
  if (card.tool.toLowerCase().includes(q)) total += 30;
  if (card.summary.toLowerCase().includes(q)) total += 15;
  for (const term of terms) {
    if (card.tool.toLowerCase().includes(term)) total += 8;
    if (card.summary.toLowerCase().includes(term)) total += 4;
    if ((card.category || '').toLowerCase().includes(term)) total += 2;
  }
  return total;
}

export function searchToolCards(catalog = [], query = '', options = {}) {
  if (!Array.isArray(catalog)) throw new TypeError('catalog must be an array');
  const policy = normalizeResultPolicy({
    max_items: options.maxItems ?? DEFAULT_RESULT_POLICY.max_items,
    max_chars: options.maxChars ?? DEFAULT_RESULT_POLICY.max_chars,
    detail: 'card',
  }, { ceiling: DEFAULT_RESULT_POLICY });
  const cards = catalog.map(toToolCard)
    .map((card, index) => ({ card, score: score(card, text(query)), index }))
    .filter((row) => row.card.tool && row.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .slice(0, policy.max_items)
    .map((row) => row.card);

  let chars = 0;
  const bounded = [];
  for (const card of cards) {
    const size = JSON.stringify(card).length;
    if (chars + size > policy.max_chars) break;
    bounded.push(card);
    chars += size;
  }
  return Object.freeze({
    query: text(query),
    cards: Object.freeze(bounded),
    receipt: Object.freeze({
      catalog_items: catalog.length,
      returned_items: bounded.length,
      chars,
      result_policy: policy,
    }),
  });
}
