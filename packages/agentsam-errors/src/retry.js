export function shouldRetry(error) { return Boolean(error?.retryable); }

export function retryDelayMs(error, attempt = 1, options = {}) {
  if (!shouldRetry(error)) return null;
  if (Number.isFinite(error?.retry_after_ms) && error.retry_after_ms >= 0) return Math.round(error.retry_after_ms);
  const baseMs = Number.isFinite(options.baseMs) && options.baseMs > 0 ? options.baseMs : 500;
  const maxMs = Number.isFinite(options.maxMs) && options.maxMs > 0 ? options.maxMs : 30_000;
  const n = Math.max(1, Number.isInteger(attempt) ? attempt : 1);
  return Math.min(maxMs, Math.round(baseMs * (2 ** Math.min(10, n - 1))));
}
