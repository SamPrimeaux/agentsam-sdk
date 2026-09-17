import { classifyProviderFailure } from './provider.js';
import { ERROR_REASON } from '../vocabulary.js';

export function classifyAnthropicFailure(evidence = {}, context = {}) {
  const type = String(evidence.type || evidence.code || '').toLowerCase();
  const message = String(evidence.message || '');
  let reason = context.reason;
  if (!reason && type === 'overloaded_error') reason = ERROR_REASON.PROVIDER_OVERLOADED;
  else if (!reason && type === 'rate_limit_error') reason = ERROR_REASON.PROVIDER_RATE_LIMITED;
  else if (!reason && type === 'authentication_error') reason = ERROR_REASON.PROVIDER_CREDENTIAL_INVALID;
  else if (!reason && type === 'permission_error') reason = ERROR_REASON.PROVIDER_SCOPE_INSUFFICIENT;
  else if (!reason && /request too large|context|token limit/i.test(message)) reason = ERROR_REASON.CONTEXT_WINDOW_EXCEEDED;
  else if (!reason && type === 'invalid_request_error') reason = ERROR_REASON.PROVIDER_REQUEST_INVALID;
  return classifyProviderFailure('anthropic', evidence, { ...context, reason });
}
