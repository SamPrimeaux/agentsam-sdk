const DEFAULT_MAX_DETAIL_CHARS = 12_000;
const SECRET_KEY = /(?:authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|password|secret|cookie|credential)/i;
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\baak_[A-Za-z0-9_-]{8,}\b/g,
  /\bsdk_[A-Za-z0-9_-]{8,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
];

function clean(value) { return value == null ? '' : String(value).trim(); }
function bounded(value, maxChars = DEFAULT_MAX_DETAIL_CHARS) {
  const text = String(value ?? '');
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function redactString(value, maxChars) {
  let text = bounded(value, maxChars);
  for (const pattern of SECRET_VALUE_PATTERNS) text = text.replace(pattern, '[REDACTED]');
  return text;
}

export function redactDiagnosticValue(value, options = {}, depth = 0, key = '') {
  const maxChars = Number.isInteger(options.maxChars) && options.maxChars > 0 ? options.maxChars : DEFAULT_MAX_DETAIL_CHARS;
  if (SECRET_KEY.test(key)) return '[REDACTED]';
  if (depth > 6) return '[TRUNCATED_DEPTH]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactString(value, maxChars);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactDiagnosticValue(item, options, depth + 1));
  if (typeof value === 'object') {
    const result = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, 80)) {
      result[childKey] = redactDiagnosticValue(childValue, options, depth + 1, childKey);
    }
    return result;
  }
  return redactString(String(value), maxChars);
}

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

export class AgentSamDiagnosticError extends Error {
  constructor(diagnostic, options = {}) {
    super(clean(diagnostic?.message) || clean(options.message) || 'AgentSam operation failed', options.cause ? { cause: options.cause } : undefined);
    this.name = 'AgentSamDiagnosticError';
    this.diagnostic = Object.freeze({ schema_version: 1, ...diagnostic });
    this.code = diagnostic?.code || diagnostic?.kind || 'agentsam_error';
    this.status = diagnostic?.http_status ?? diagnostic?.status ?? null;
  }
}

export function createOpenAIHttpError({ status, body, headers, requestedServiceTier, rawText } = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  const providerError = payload.error && typeof payload.error === 'object' ? payload.error : payload;
  const type = clean(providerError.type) || null;
  const code = clean(providerError.code) || null;
  const message = clean(providerError.message || payload.message || rawText) || `OpenAI API returned HTTP ${status}`;
  const classification = classifyOpenAIError({ status, type, code, message, param: providerError.param });
  const diagnostic = {
    source: 'openai',
    kind: 'provider_http_error',
    http_status: Number(status || 0) || null,
    type,
    code,
    param: clean(providerError.param) || null,
    message: redactString(message, 4_000),
    category: classification.category,
    retriable: classification.retriable,
    retry_strategy: classification.retry_strategy,
    retry_after_ms: retryAfterMs(headers),
    request_id: header(headers, 'x-request-id') || header(headers, 'openai-request-id') || header(headers, 'request-id') || null,
    ray_id: header(headers, 'cf-ray') || null,
    requested_service_tier: clean(requestedServiceTier) || null,
    details: redactDiagnosticValue(payload, { maxChars: DEFAULT_MAX_DETAIL_CHARS }),
  };
  return new AgentSamDiagnosticError(diagnostic);
}

export function createProcessDiagnosticError({ code, message, command, args, cwd, exitCode, signal, stderr, stdout, cause, retriable = false } = {}) {
  return new AgentSamDiagnosticError({
    source: 'process',
    kind: 'process_error',
    code: clean(code) || 'process_failed',
    message: clean(message) || 'Process failed',
    retriable: Boolean(retriable),
    retry_strategy: retriable ? 'retry_after_inspection' : 'inspect_error',
    command: clean(command) || null,
    args: Array.isArray(args) ? args.slice(0, 64).map((value) => redactString(value, 1_000)) : [],
    cwd: clean(cwd) || null,
    exit_code: Number.isInteger(exitCode) ? exitCode : null,
    signal: clean(signal) || null,
    stderr: redactString(stderr || '', 12_000) || null,
    stdout: redactString(stdout || '', 4_000) || null,
  }, { cause });
}

export function diagnosticFromError(error, fallback = {}) {
  if (error?.diagnostic) return error.diagnostic;
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
