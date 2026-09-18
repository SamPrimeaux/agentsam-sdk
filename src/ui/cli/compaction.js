import pc from 'picocolors';

function n(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)).toLocaleString('en-US') : null;
}

export function renderCompactionReceipt(payload = {}) {
  const before = n(payload.tokens_before ?? payload.before_tokens);
  const after = n(payload.tokens_after ?? payload.after_tokens);
  const duration = Number(payload.duration_ms);
  const detail = before && after ? ` ${before} → ${after}` : '';
  const timing = Number.isFinite(duration) ? ` · ${duration < 1000 ? Math.round(duration) + 'ms' : (duration / 1000).toFixed(1) + 's'}` : '';
  return `  ${pc.green('↻')} Context compacted${pc.dim(detail + timing)}`;
}
