import { createErrorEnvelope } from '../envelope.js';
import { ERROR_REASON } from '../vocabulary.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function lower(...values) { return values.map(clean).join(' ').toLowerCase(); }
function header(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return clean(headers.get(name));
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) if (String(key).toLowerCase() === wanted) return clean(value);
  return '';
}
function retryAfterMs(headers, explicit) {
  if (Number.isFinite(explicit) && explicit >= 0) return Math.round(explicit);
  const value = header(headers, 'retry-after');
  if (!value) return null;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Math.max(0, Math.round(Number(value) * 1000));
  const when = Date.parse(value);
  return Number.isFinite(when) ? Math.max(0, when - Date.now()) : null;
}
function requestId(headers, explicit) {
  return clean(explicit) || header(headers, 'x-request-id') || header(headers, 'request-id') || header(headers, 'cf-ray') || null;
}

function reasonFromGenericEvidence(evidence = {}) {
  const status = Number(evidence.status || evidence.http_status || 0);
  const code = clean(evidence.code || evidence.provider_code).toLowerCase();
  const type = clean(evidence.type).toLowerCase();
  const text = lower(code, type, evidence.message, evidence.error);
  if (evidence.connected === false) return ERROR_REASON.PROVIDER_NOT_CONNECTED;
  if (evidence.credential_state === 'missing') return ERROR_REASON.PROVIDER_CREDENTIAL_MISSING;
  if (evidence.credential_state === 'expired') return ERROR_REASON.PROVIDER_CREDENTIAL_EXPIRED;
  if (evidence.credential_state === 'invalid') return ERROR_REASON.PROVIDER_CREDENTIAL_INVALID;
  if (/credit|billing|spend[_ -]?limit|budget|payment required/.test(text)) return ERROR_REASON.PROVIDER_BUDGET_EXHAUSTED;
  if (/quota|resource[_ -]?exhausted|usage[_ -]?limit/.test(text)) return ERROR_REASON.PROVIDER_QUOTA_EXHAUSTED;
  if (/context.{0,20}(too long|limit|window|length)|max(?:imum)?[_ -]?tokens|request too large/.test(text)) return ERROR_REASON.CONTEXT_WINDOW_EXCEEDED;
  if (/service[_ -]?tier/.test(text) && /(unsupported|invalid|not available)/.test(text)) return ERROR_REASON.SERVICE_TIER_UNSUPPORTED;
  if (/region|country|location/.test(text) && /(unsupported|not available|restricted)/.test(text)) return ERROR_REASON.PROVIDER_REGION_UNSUPPORTED;
  if (/content[_ -]?(filter|policy|blocked)|safety|moderation/.test(text)) return ERROR_REASON.PROVIDER_CONTENT_BLOCKED;
  if (/model/.test(text) && /(not found|unknown|does not exist|unsupported)/.test(text)) return ERROR_REASON.PROVIDER_MODEL_NOT_FOUND;
  if (status === 401 || /invalid[_ -]?(api[_ -]?)?key|authentication_error|unauthenticated/.test(text)) return ERROR_REASON.PROVIDER_CREDENTIAL_INVALID;
  if (status === 403 || /permission|forbidden|scope/.test(text)) return ERROR_REASON.PROVIDER_SCOPE_INSUFFICIENT;
  if (status === 429 || /rate[_ -]?limit|too many requests|slow[_ -]?down/.test(text)) return ERROR_REASON.PROVIDER_RATE_LIMITED;
  if (status === 503 || status === 529 || /overload|overloaded|capacity/.test(text)) return ERROR_REASON.PROVIDER_OVERLOADED;
  if (status >= 500) return ERROR_REASON.PROVIDER_UNAVAILABLE;
  if (status === 404) return ERROR_REASON.TARGET_NOT_FOUND;
  if (status === 400 || status === 409 || status === 422) return ERROR_REASON.PROVIDER_REQUEST_INVALID;
  return ERROR_REASON.UNKNOWN;
}

export function classifyProviderFailure(provider, evidence = {}, context = {}) {
  const name = clean(provider || context.provider || 'provider').toLowerCase();
  const reason = context.reason || reasonFromGenericEvidence(evidence);
  const providerCode = clean(evidence.code || evidence.provider_code || evidence.type) || null;
  const requestOrigin = clean(context.request_origin || evidence.request_origin).toLowerCase();
  const internalRequestFailure = reason === ERROR_REASON.PROVIDER_REQUEST_INVALID && requestOrigin === 'agentsam';
  const localConfigurationFailure = [ERROR_REASON.PROVIDER_NOT_CONNECTED, ERROR_REASON.PROVIDER_CREDENTIAL_MISSING].includes(reason);
  return createErrorEnvelope({
    reason,
    message: context.message || evidence.message || evidence.error || `${name} request failed`,
    source: context.source || (localConfigurationFailure
      ? { kind: 'user', name: 'project_configuration', service: name }
      : { kind: 'provider', name, service: clean(context.service || evidence.service) || null }),
    resolution_owner: internalRequestFailure ? 'agentsam' : context.resolution_owner,
    severity: internalRequestFailure ? 'blocking_internal' : context.severity,
    remediation: internalRequestFailure ? { action: 'inspect_platform' } : context.remediation,
    domain: context.domain || 'provider',
    tool: context.tool || name,
    stage: context.stage || 'request',
    retryable: context.retryable,
    retry_after_ms: retryAfterMs(evidence.headers, evidence.retry_after_ms),
    http_status: Number(evidence.status || evidence.http_status || 0) || undefined,
    provider: name,
    provider_code: providerCode,
    request_id: requestId(evidence.headers, evidence.request_id),
    trace_id: evidence.trace_id || context.trace_id || null,
    resource: context.resource || null,
    environment: context.environment || null,
    native: {
      code: providerCode,
      exception_type: evidence.type || evidence.exception_type || null,
      stack: evidence.stack || null,
    },
    details: evidence.details ?? evidence.body ?? null,
  });
}

export { reasonFromGenericEvidence };
