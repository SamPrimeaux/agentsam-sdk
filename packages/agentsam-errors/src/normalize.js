import { AgentSamError } from './error.js';
import { canonicalCodeFromHttpStatus, createErrorEnvelope, isErrorEnvelope } from './envelope.js';
import { ERROR_REASON } from './vocabulary.js';

function clean(value) { return value == null ? '' : String(value).trim(); }

export function normalizeError(error, context = {}) {
  if (isErrorEnvelope(error)) return error;
  if (error instanceof AgentSamError) return error.envelope;
  if (isErrorEnvelope(error?.envelope)) return error.envelope;
  if (isErrorEnvelope(error?.error)) return error.error;
  const status = Number(error?.status || error?.http_status || context.http_status || 0) || null;
  const canonical = clean(context.code) || (status ? canonicalCodeFromHttpStatus(status) : undefined);
  return createErrorEnvelope({
    ...context,
    code: canonical,
    reason: context.reason || ERROR_REASON.INTERNAL,
    message: context.message || error?.message || String(error || 'Unknown error'),
    http_status: status,
    native: context.native || {
      code: error?.code || null,
      exception_type: error?.name || null,
      stack: error?.stack || null,
    },
    source: context.source || { kind: 'agentsam', name: 'agentsam-sdk' },
    resolution_owner: context.resolution_owner || 'agentsam',
    severity: context.severity || 'blocking_internal',
    remediation: context.remediation || { action: 'inspect_platform' },
  });
}
