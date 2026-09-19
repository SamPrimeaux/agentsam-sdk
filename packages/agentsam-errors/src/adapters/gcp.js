import { classifyProviderFailure } from './provider.js';
import { ERROR_REASON } from '../vocabulary.js';

export function classifyGcpFailure(evidence = {}, context = {}) {
  const statusName = String(evidence.status_name || evidence.type || evidence.code || '').toUpperCase();
  const text = `${evidence.message || ''} ${evidence.error || ''}`.toLowerCase();
  let reason = context.reason;
  if (!reason && (evidence.project_state === 'missing' || /project.*(?:missing|not set|not specified)/.test(text))) reason = ERROR_REASON.GCP_PROJECT_MISSING;
  else if (!reason && /api.*(?:disabled|not enabled)|has not been used.*before/.test(text)) reason = ERROR_REASON.GCP_API_DISABLED;
  else if (!reason && (statusName === 'RESOURCE_EXHAUSTED' || /quota/.test(text))) reason = ERROR_REASON.GCP_QUOTA_EXHAUSTED;
  else if (!reason && (statusName === 'NOT_FOUND' || Number(evidence.status) === 404) && (context.resource?.type === 'vm' || /instance|vm/.test(text))) reason = ERROR_REASON.GCP_VM_NOT_FOUND;
  else if (!reason && (statusName === 'UNAVAILABLE' || Number(evidence.status) === 503)) reason = ERROR_REASON.GCP_VM_UNAVAILABLE;
  return classifyProviderFailure('gcp', evidence, { ...context, reason, domain: context.domain || 'runtime', tool: context.tool || 'gcp' });
}
