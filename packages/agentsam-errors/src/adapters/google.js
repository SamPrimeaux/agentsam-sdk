import { classifyProviderFailure } from './provider.js';
import { ERROR_REASON } from '../vocabulary.js';

export function classifyGoogleAIFailure(evidence = {}, context = {}) {
  const statusName = String(evidence.status_name || evidence.type || evidence.code || '').toUpperCase();
  const message = String(evidence.message || '');
  let reason = context.reason;
  if (!reason && /API key not valid|invalid API key/i.test(message)) reason = ERROR_REASON.PROVIDER_CREDENTIAL_INVALID;
  else if (!reason && statusName === 'UNAUTHENTICATED') reason = ERROR_REASON.PROVIDER_CREDENTIAL_INVALID;
  else if (!reason && statusName === 'PERMISSION_DENIED') reason = ERROR_REASON.PROVIDER_SCOPE_INSUFFICIENT;
  else if (!reason && statusName === 'RESOURCE_EXHAUSTED') reason = /billing|budget/i.test(message) ? ERROR_REASON.PROVIDER_BUDGET_EXHAUSTED : ERROR_REASON.PROVIDER_QUOTA_EXHAUSTED;
  else if (!reason && statusName === 'UNAVAILABLE') reason = ERROR_REASON.PROVIDER_UNAVAILABLE;
  else if (!reason && statusName === 'INVALID_ARGUMENT') reason = ERROR_REASON.PROVIDER_REQUEST_INVALID;
  return classifyProviderFailure(context.provider || 'google_ai', evidence, { ...context, reason });
}

export const classifyGeminiFailure = (evidence = {}, context = {}) => classifyGoogleAIFailure(evidence, { ...context, provider: 'gemini' });
