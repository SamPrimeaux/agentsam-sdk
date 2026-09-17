import { classifyProviderFailure } from './provider.js';
import { ERROR_REASON } from '../vocabulary.js';

const BUDGET_CODES = new Set(['credit_balance_exhausted','organization_spend_limit_exceeded','project_spend_limit_exceeded','organization_usage_limit_exceeded']);

export function classifyOpenAIFailure(evidence = {}, context = {}) {
  const code = String(evidence.code || evidence.provider_code || '').toLowerCase();
  const message = String(evidence.message || '');
  let reason = context.reason;
  if (!reason && BUDGET_CODES.has(code)) reason = ERROR_REASON.PROVIDER_BUDGET_EXHAUSTED;
  else if (!reason && (code === 'insufficient_quota' || /quota/i.test(message))) reason = ERROR_REASON.PROVIDER_QUOTA_EXHAUSTED;
  else if (!reason && code === 'previous_response_not_found') reason = ERROR_REASON.CONTINUATION_INVALID;
  else if (!reason && code === 'websocket_connection_limit_reached') reason = ERROR_REASON.PROVIDER_CAPACITY_EXHAUSTED;
  else if (!reason && (code === 'server_is_overloaded' || /overload/i.test(message))) reason = ERROR_REASON.PROVIDER_OVERLOADED;
  else if (!reason && /service[_ -]?tier/i.test(message)) reason = ERROR_REASON.SERVICE_TIER_UNSUPPORTED;
  return classifyProviderFailure('openai', evidence, { ...context, reason });
}
