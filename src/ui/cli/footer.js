import pc from 'picocolors';

function count(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'm';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1) + 'k';
  return String(Math.round(n));
}

function ctxLabel(usage) {
  const active = Number(usage?.current_context?.input_tokens || 0);
  const window = Number(usage?.current_context?.window_tokens || 0);
  if (!(window > 0)) return active > 0 ? `ctx ${count(active)} / unknown` : 'ctx unknown';
  return `ctx ${Math.min(999, Math.round((active / window) * 100))}%`;
}

export function renderCliFooter(value = {}) {
  const usage = value.usage || value.usageSnapshot || {};
  const cumulative = usage.cumulative || {};
  const model = String(value.model || value.modelLabel || 'model');
  const tier = String(value.tier || '').trim();
  const elapsedMs = Number(value.elapsedMs);
  const parts = [
    model,
    ctxLabel(usage),
    `↑${count(cumulative.input_tokens)} ↓${count(cumulative.output_tokens)}`,
  ];
  if (Number(cumulative.cached_input_tokens) > 0) parts.push(`cache ${count(cumulative.cached_input_tokens)}`);
  if (tier && tier !== 'default') parts.push(tier);
  if (Number.isFinite(elapsedMs) && elapsedMs >= 0) parts.push(elapsedMs < 60_000 ? `${(elapsedMs / 1000).toFixed(1)}s` : `${Math.floor(elapsedMs / 60_000)}m${Math.floor((elapsedMs % 60_000) / 1000)}s`);
  return pc.dim('  ' + parts.join(' · '));
}
