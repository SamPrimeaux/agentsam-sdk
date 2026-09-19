import { canonicalCodeFromHttpStatus, createErrorEnvelope, isErrorEnvelope, parseError } from './envelope.js';
import { ERROR_REASON } from './vocabulary.js';

function header(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return String(headers.get(name) || '');
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) if (String(key).toLowerCase() === wanted) return String(value || '');
  return '';
}

export function toHttpError(error) {
  const envelope = isErrorEnvelope(error) ? error : error?.envelope;
  if (!envelope) throw new TypeError('toHttpError requires an AgentSam ErrorEnvelope or AgentSamError');
  return Object.freeze({
    status: envelope.http_status || 500,
    headers: Object.freeze({ 'content-type': 'application/json', 'cache-control': 'no-store' }),
    body: Object.freeze({ error: envelope }),
  });
}

export function fromHttpError({ status, body, headers, source, provider, domain = 'transport', stage = 'request' } = {}) {
  const candidate = body?.error ?? body;
  if (isErrorEnvelope(candidate)) return parseError(candidate);
  const code = canonicalCodeFromHttpStatus(status);
  return createErrorEnvelope({
    code,
    reason: code === 'UNAUTHENTICATED' ? ERROR_REASON.AUTH_INVALID
      : code === 'PERMISSION_DENIED' ? ERROR_REASON.PERMISSION_DENIED
        : code === 'RESOURCE_EXHAUSTED' ? ERROR_REASON.RATE_LIMITED
          : code === 'UNAVAILABLE' ? ERROR_REASON.TRANSPORT_UNREACHABLE
            : code === 'DEADLINE_EXCEEDED' ? ERROR_REASON.TRANSPORT_TIMEOUT
              : ERROR_REASON.UNKNOWN,
    message: candidate?.message || candidate?.error || `HTTP ${status || 500} request failed`,
    retryable: Number(status) === 429 || Number(status) >= 500,
    retry_after_ms: (() => {
      const value = header(headers, 'retry-after');
      if (!value) return null;
      if (/^\d+(?:\.\d+)?$/.test(value)) return Math.max(0, Math.round(Number(value) * 1000));
      const when = Date.parse(value);
      return Number.isFinite(when) ? Math.max(0, when - Date.now()) : null;
    })(),
    http_status: Number(status) || null,
    source: source || { kind: provider ? 'provider' : 'runtime', name: provider || 'http' },
    provider: provider || null,
    provider_code: candidate?.code || null,
    request_id: header(headers, 'x-request-id') || header(headers, 'request-id') || null,
    domain,
    stage,
    details: candidate,
  });
}
