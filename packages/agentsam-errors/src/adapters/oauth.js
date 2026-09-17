import { createErrorEnvelope } from '../envelope.js';
import { ERROR_REASON } from '../vocabulary.js';

export function classifyOAuthFailure(error, context = {}) {
  const code = String(error?.code || error || '').toLowerCase();
  let reason = context.reason;
  if (!reason && ['invalid_client','invalid_grant'].includes(code)) reason = ERROR_REASON.PROVIDER_CREDENTIAL_INVALID;
  else if (!reason && ['unauthorized_client','access_denied'].includes(code)) reason = ERROR_REASON.USER_PERMISSION_DENIED;
  else if (!reason && ['invalid_scope'].includes(code)) reason = ERROR_REASON.PROVIDER_SCOPE_INSUFFICIENT;
  else if (!reason && ['invalid_request','unsupported_grant_type'].includes(code)) reason = ERROR_REASON.INPUT_INVALID;
  else reason ||= ERROR_REASON.UNKNOWN;
  return createErrorEnvelope({
    reason,
    message: context.message || error?.message || `OAuth failure: ${code || 'unknown'}`,
    source: context.source || { kind: context.provider ? 'provider' : 'runtime', name: context.provider || 'oauth' },
    domain: 'auth',
    tool: context.provider || 'oauth',
    stage: context.stage || 'oauth',
    provider: context.provider || null,
    provider_code: code || null,
    native: { code },
    details: error?.details || null,
  });
}
