// Deprecated compatibility surface over the canonical AgentSam error runtime.
import {
  AgentSamError,
  classifyOpenAIFailure,
  classifyProcessFailure,
  normalizeError,
  redactErrorValue,
  renderError,
} from '../../packages/agentsam-errors/src/index.js';

export const AgentSamDiagnosticError = AgentSamError;
export const redactDiagnosticValue = redactErrorValue;
export const diagnosticFromError = normalizeError;
export const renderDiagnosticError = renderError;

function retryStrategy(envelope, input = {}) {
  if (envelope.reason === 'continuation_invalid') return 'retry_full_context';
  if (String(input.code || '').toLowerCase() === 'websocket_connection_limit_reached') return 'reconnect';
  if (!envelope.retryable) {
    if (['provider_budget_exhausted','provider_quota_exhausted'].includes(envelope.reason)) return 'operator_action';
    if (envelope.reason === 'service_tier_unsupported') return 'change_configuration';
    if (envelope.reason === 'provider_request_invalid') return 'change_request';
    if (envelope.reason === 'provider_credential_invalid') return 'fix_credentials';
    return 'inspect_error';
  }
  return envelope.retry_after_ms != null ? 'retry_after_backoff' : 'retry_backoff';
}

function category(envelope, input = {}) {
  if (envelope.reason === 'continuation_invalid') return 'continuation';
  if (String(input.code || '').toLowerCase() === 'websocket_connection_limit_reached') return 'connection_lifetime';
  if (['provider_budget_exhausted','provider_quota_exhausted'].includes(envelope.reason)) return 'billing_or_quota';
  if (envelope.reason === 'service_tier_unsupported') return 'service_tier';
  if (envelope.reason === 'provider_request_invalid') return 'invalid_request';
  if (envelope.reason === 'provider_credential_invalid') return 'authentication';
  if (envelope.reason === 'provider_scope_insufficient') return 'authorization_or_region';
  if (envelope.reason === 'provider_rate_limited') return String(input.code || '').toLowerCase() === 'slow_down' ? 'ramp_rate' : 'rate_limit';
  if (envelope.reason === 'provider_overloaded') return 'provider_overload';
  if (envelope.reason === 'provider_unavailable') return 'provider_server';
  return 'provider_error';
}

export function classifyOpenAIError(input = {}) {
  const envelope = classifyOpenAIFailure(input);
  return {
    category: category(envelope, input),
    retriable: envelope.retryable,
    retry_strategy: retryStrategy(envelope, input),
  };
}

export function createOpenAIHttpError({ status, body, headers, requestedServiceTier, rawText } = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  const providerError = payload.error && typeof payload.error === 'object' ? payload.error : payload;
  const envelope = classifyOpenAIFailure({
    status,
    type: providerError.type,
    code: providerError.code,
    message: providerError.message || payload.message || rawText || `OpenAI API returned HTTP ${status}`,
    headers,
    body: payload,
    details: { ...payload, requested_service_tier: requestedServiceTier || null },
  });
  return new AgentSamError(envelope);
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
  }, {
    retryable,
    message,
    source: { kind: 'runtime', name: 'process' },
  });
  return new AgentSamError(envelope, { cause });
}
