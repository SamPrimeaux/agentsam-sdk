export const RESULT_DETAIL_ORDER = Object.freeze(['metadata', 'card', 'excerpt', 'range', 'full']);

export const DEFAULT_RESULT_POLICY = Object.freeze({
  max_items: 8,
  max_chars: 24_000,
  detail: 'excerpt',
});

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${label} must be a positive integer`);
  return value;
}

function detailRank(value) {
  const index = RESULT_DETAIL_ORDER.indexOf(value);
  if (index === -1) throw new RangeError(`detail must be one of: ${RESULT_DETAIL_ORDER.join(', ')}`);
  return index;
}

export function normalizeResultPolicy(value = {}, options = {}) {
  const ceiling = { ...DEFAULT_RESULT_POLICY, ...(options.ceiling || {}) };
  const requested = {
    max_items: positiveInteger(value.max_items ?? ceiling.max_items, 'max_items'),
    max_chars: positiveInteger(value.max_chars ?? ceiling.max_chars, 'max_chars'),
    detail: value.detail ?? ceiling.detail,
  };
  detailRank(requested.detail);
  detailRank(ceiling.detail);

  const higherDetailOperation = options.operation === 'higher-detail';
  if (!higherDetailOperation) {
    if (requested.max_items > ceiling.max_items) throw new RangeError('result_policy_higher_detail_required:max_items');
    if (requested.max_chars > ceiling.max_chars) throw new RangeError('result_policy_higher_detail_required:max_chars');
    if (detailRank(requested.detail) > detailRank(ceiling.detail)) throw new RangeError('result_policy_higher_detail_required:detail');
  }
  return Object.freeze(requested);
}

export function truncateResultText(value, maxChars = DEFAULT_RESULT_POLICY.max_chars) {
  const text = String(value ?? '');
  positiveInteger(maxChars, 'maxChars');
  if (text.length <= maxChars) return Object.freeze({ text, chars: text.length, source_chars: text.length, truncated: false });
  const bounded = `${text.slice(0, Math.max(0, maxChars - 1))}…`;
  return Object.freeze({ text: bounded, chars: bounded.length, source_chars: text.length, truncated: true });
}

export function boundResultItems(items = [], requested = {}, options = {}) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  const policy = normalizeResultPolicy(requested, options);
  const selected = items.slice(0, policy.max_items);
  const serialized = JSON.stringify(selected);
  const bounded = truncateResultText(serialized, policy.max_chars);
  return Object.freeze({
    items: Object.freeze(selected),
    policy,
    receipt: Object.freeze({
      source_items: items.length,
      returned_items: selected.length,
      omitted_items: Math.max(0, items.length - selected.length),
      serialized_chars: serialized.length,
      max_chars: policy.max_chars,
      detail: policy.detail,
      serialized_overflow: bounded.truncated,
    }),
  });
}
