// Backward-compatible diagnostic facade over the canonical AgentSam error runtime.
import {
  AgentSamError,
  classifyOpenAIFailure,
  classifyProcessFailure,
  normalizeError,
  redactErrorValue,
  redactString,
} from '../../packages/agentsam-errors/src/index.js';

const DEFAULT_MAX_DETAIL_CHARS = 12_000;
function clean(value) { return value == null ? '' : String(value).trim(); }
function header(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return clean(headers.get(name));
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) if (String(key).toLowerCase() === wanted) return clean(value);
  return '';
}
function retryAfterMs(headers) {
  const value = header(headers, 'retry-after');
  if (!value) return null;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Math.max(0, Math.round(Number(value) * 1000));
  const when = Date.parse(value);
  return Number.isFinite(when) ? Math.max(0, when - Date.now()) : null;
}

const OPENAI_NON_RETRY_CODES = new Set([
  'credit_balance_exhausted',
  'organization_spend_limit_exceeded',
  'project_spend_limit_exceeded',
  'organization_usage_limit_exceeded',
]);

export const redactDiagnosticValue = redactErrorValue;

export function classifyOpenAIError({ status, type, code, message, param } = {}) {
  const httpStatus = Number(status || 0);
  const normalizedType = clean(type).toLowerCase();
  const normalizedCode = clean(code).toLowerCase();
  const diagnosticText = `${normalizedCode} ${normalizedType} ${clean(param).toLowerCase()} ${clean(message).toLowerCase()}`;
  if (normalizedCode === 'previous_response_not_found') return { category: 'continuation', retriable: true, retry_strategy: 'retry_full_context' };
  if (normalizedCode === 'websocket_connection_limit_reached') return { category: 'connection_lifetime', retriable: true, retry_strategy: 'reconnect' };
  if (OPENAI_NON_RETRY_CODES.has(normalizedCode)) return { category: 'billing_or_quota', retriable: false, retry_strategy: 'operator_action' };
  if (httpStatus === 400 && /service[_ -]?tier/.test(diagnosticText)) return { category: 'service_tier', retriable: false, retry_strategy: 'change_configuration' };
  if (httpStatus === 400) return { category: 'invalid_request', retriable: false, retry_strategy: 'change_request' };
  if (httpStatus === 401) return { category: 'authentication', retriable: false, retry_strategy: 'fix_credentials' };
  if (httpStatus === 403) return { category: 'authorization_or_region', retriable: false, retry_strategy: 'operator_action' };
  if (httpStatus === 429 && normalizedCode === 'slow_down') return { category: 'ramp_rate', retriable: true, retry_strategy: 'retry_after_backoff' };
  if (httpStatus === 429) return { category: 'rate_limit', retriable: true, retry_strategy: 'retry_after_backoff' };
  if (httpStatus === 500) return { category: 'provider_server', retriable: true, retry_strategy: 'retry_backoff' };
  if (httpStatus === 503 || normalizedCode === 'server_is_overloaded') return { category: 'provider_overload', retriable: true, retry_strategy: 'retry_after_backoff' };
  return { category: 'provider_error', retriable: false, retry_strategy: 'inspect_error' };
}

function legacyDiagnosticFromEnvelope(envelope, fallback = {}) {
  const nativeCode = clean(envelope?.provider_code || envelope?.native?.code || fallback.code);
  const source = fallback.source || envelope?.provider || envelope?.source?.name || 'agentsam';
  return Object.freeze({
    schema_version: 1,
    source,
    kind: fallback.kind || 'runtime_error',
    code: nativeCode || envelope?.reason || envelope?.code || 'runtime_error',
    canonical_code: envelope?.code || null,
    reason: envelope?.reason || null,
    severity: envelope?.severity || null,
    resolution_owner: envelope?.resolution_owner || null,
    message: redactString(envelope?.message || fallback.message || 'Unknown error', 4_000),
    http_status: envelope?.http_status ?? null,
    retriable: Boolean(envelope?.retryable),
    retry_strategy: fallback.retry_strategy || (envelope?.retryable
      ? (envelope?.retry_after_ms != null ? 'retry_after_backoff' : 'retry_backoff')
      : 'inspect_error'),
    retry_after_ms: envelope?.retry_after_ms ?? null,
    request_id: envelope?.request_id || null,
    trace_id: envelope?.trace_id || null,
    fingerprint: envelope?.fingerprint || null,
    details: redactErrorValue(envelope?.details ?? null, { maxChars: DEFAULT_MAX_DETAIL_CHARS }),
  });
}

export class AgentSamDiagnosticError extends AgentSamError {
  constructor(diagnostic = {}, options = {}) {
    const message = clean(diagnostic?.message) || clean(options.message) || 'AgentSam operation failed';
    const native = new Error(message);
    native.code = clean(diagnostic?.code) || null;
    native.status = diagnostic?.http_status ?? diagnostic?.status ?? null;
    const envelope = options.envelope || normalizeError(native, {
      message,
      http_status: native.status,
      source: { kind: diagnostic?.source === 'openai' || diagnostic?.source === 'cloudflare' ? 'provider' : 'runtime', name: clean(diagnostic?.source) || 'agentsam-sdk' },
      provider: ['openai', 'cloudflare'].includes(clean(diagnostic?.source)) ? clean(diagnostic?.source) : null,
      native: {
        code: clean(diagnostic?.code) || null,
        exit_code: Number.isInteger(diagnostic?.exit_code) ? diagnostic.exit_code : null,
        signal: clean(diagnostic?.signal) || null,
        stderr: diagnostic?.stderr || null,
        stdout: diagnostic?.stdout || null,
      },
      details: diagnostic?.details ?? null,
    });
    super(envelope, options.cause ? { cause: options.cause } : undefined);
    this.name = 'AgentSamDiagnosticError';
    this.diagnostic = Object.freeze({ schema_version: 1, ...redactErrorValue(diagnostic, { maxChars: DEFAULT_MAX_DETAIL_CHARS }) });
    // Preserve the historical native/provider code on this compatibility class.
    this.code = diagnostic?.code || diagnostic?.kind || envelope.code || 'agentsam_error';
    this.status = diagnostic?.http_status ?? diagnostic?.status ?? envelope.http_status ?? null;
  }
}

export function createOpenAIHttpError({ status, body, headers, requestedServiceTier, rawText } = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  const providerError = payload.error && typeof payload.error === 'object' ? payload.error : payload;
  const type = clean(providerError.type) || null;
  const code = clean(providerError.code) || null;
  const message = clean(providerError.message || payload.message || rawText) || `OpenAI API returned HTTP ${status}`;
  const classification = classifyOpenAIError({ status, type, code, message, param: providerError.param });
  const envelope = classifyOpenAIFailure({
    status,
    type,
    code,
    message,
    headers,
    body: payload,
    details: { ...payload, requested_service_tier: requestedServiceTier || null },
  });
  const diagnostic = {
    source: 'openai',
    kind: 'provider_http_error',
    http_status: Number(status || 0) || null,
    type,
    code,
    canonical_code: envelope.code,
    reason: envelope.reason,
    param: clean(providerError.param) || null,
    message: redactString(message, 4_000),
    category: classification.category,
    retriable: classification.retriable,
    retry_strategy: classification.retry_strategy,
    retry_after_ms: retryAfterMs(headers),
    request_id: header(headers, 'x-request-id') || header(headers, 'openai-request-id') || header(headers, 'request-id') || envelope.request_id || null,
    ray_id: header(headers, 'cf-ray') || null,
    requested_service_tier: clean(requestedServiceTier) || null,
    details: redactErrorValue(payload, { maxChars: DEFAULT_MAX_DETAIL_CHARS }),
  };
  return new AgentSamDiagnosticError(diagnostic, { envelope });
}

export function createProcessDiagnosticError({ code, message, command, args, cwd, exitCode, signal, stderr, stdout, cause, retriable = false } = {}) {
  const envelope = classifyProcessFailure({
    code,
    message,
    exit_code: exitCode,
    signal,
    stderr,
    stdout,
    stack: cause?.stack,
    details: { command: command || null, args: Array.isArray(args) ? args : [], cwd: cwd || null },
  }, { retryable: Boolean(retriable), message, source: { kind: 'runtime', name: 'process' } });
  const diagnostic = {
    source: 'process',
    kind: 'process_error',
    code: clean(code) || 'process_failed',
    canonical_code: envelope.code,
    reason: envelope.reason,
    message: clean(message) || 'Process failed',
    retriable: Boolean(retriable),
    retry_strategy: retriable ? 'retry_after_inspection' : 'inspect_error',
    command: clean(command) || null,
    args: Array.isArray(args) ? args.slice(0, 64).map(value => redactString(value, 1_000)) : [],
    cwd: clean(cwd) || null,
    exit_code: Number.isInteger(exitCode) ? exitCode : null,
    signal: clean(signal) || null,
    stderr: redactString(stderr || '', 12_000) || null,
    stdout: redactString(stdout || '', 4_000) || null,
  };
  return new AgentSamDiagnosticError(diagnostic, { envelope, cause });
}

export function diagnosticFromError(error, fallback = {}) {
  if (error?.diagnostic) return error.diagnostic;
  const envelope = error?.envelope || (error?.ok === false && error?.schema_version ? error : null);
  if (envelope) return legacyDiagnosticFromEnvelope(envelope, fallback);
  return Object.freeze({
    schema_version: 1,
    source: fallback.source || 'agentsam',
    kind: fallback.kind || 'runtime_error',
    code: clean(error?.code || fallback.code) || 'runtime_error',
    message: redactString(error?.message || error || fallback.message || 'Unknown error', 4_000),
    http_status: Number(error?.status || fallback.status || 0) || null,
    retriable: Boolean(fallback.retriable),
    retry_strategy: fallback.retry_strategy || 'inspect_error',
  });
}

export function renderDiagnosticError(error) {
  const d = diagnosticFromError(error);
  const identity = [d.source, d.http_status ? `HTTP ${d.http_status}` : '', d.type, d.code].filter(Boolean).join(' · ');
  const lines = [`✗ ${d.message}`, identity ? `  ${identity}` : ''];
  if (d.request_id) lines.push(`  request_id: ${d.request_id}`);
  if (d.ray_id) lines.push(`  ray_id: ${d.ray_id}`);
  if (d.retry_after_ms != null) lines.push(`  retry_after_ms: ${d.retry_after_ms}`);
  if (d.retry_strategy) lines.push(`  retry: ${d.retriable ? 'yes' : 'no'} · ${d.retry_strategy}`);
  return lines.filter(Boolean).join('\n');
}
