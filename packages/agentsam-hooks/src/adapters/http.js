function clean(value) {
  return value == null ? '' : String(value).trim();
}

function safeUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`unsupported_hook_http_protocol:${url.protocol}`);
  if (url.username || url.password) throw new Error('hook_http_url_must_not_contain_credentials');
  return url;
}

export function createHttpHookAdapter(options = {}) {
  const url = safeUrl(clean(options.url));
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('hook_http_fetch_required');
  const timeoutMs = Number(options.timeout_ms ?? options.timeoutMs ?? 10_000);
  const maxResponseBytes = Number(options.max_response_bytes ?? options.maxResponseBytes ?? 1_048_576);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) throw new RangeError('invalid_hook_http_timeout');
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > 16_777_216) throw new RangeError('invalid_hook_http_response_limit');
  const configuredHeaders = Object.fromEntries(Object.entries(options.headers || {}).map(([key, value]) => [key, String(value)]));

  return async (envelope) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`hook_http_timeout:${timeoutMs}`)), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', ...configuredHeaders },
        body: JSON.stringify(envelope),
        signal: controller.signal,
      });
      const length = Number(response.headers?.get?.('content-length') || 0);
      if (length > maxResponseBytes) throw new Error(`hook_http_response_limit_exceeded:${maxResponseBytes}`);
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > maxResponseBytes) throw new Error(`hook_http_response_limit_exceeded:${maxResponseBytes}`);
      if (!response.ok) {
        const error = new Error(`hook_http_failed:${response.status}:${text.slice(0, 512)}`);
        error.status = response.status;
        error.code = 'AGENTSAM_HOOK_HTTP_FAILED';
        throw error;
      }
      if (!text.trim()) return null;
      try { return JSON.parse(text); }
      catch (error) {
        const invalid = new Error(`hook_http_invalid_json:${error.message}`);
        invalid.code = 'AGENTSAM_HOOK_INVALID_OUTPUT';
        throw invalid;
      }
    } catch (error) {
      error.adapter = 'http';
      error.protocol = 'http';
      error.transport = url.protocol.slice(0, -1);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}
