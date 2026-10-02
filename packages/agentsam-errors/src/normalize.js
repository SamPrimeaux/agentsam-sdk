import { AgentSamError } from './error.js';
import { canonicalCodeFromHttpStatus, createErrorEnvelope, isErrorEnvelope } from './envelope.js';
import { ERROR_REASON, ERROR_REASON_ALIASES, ERROR_REASON_POLICY } from './vocabulary.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function token(value) { return clean(value).split(':', 1)[0]; }

/**
 * Resolves canonical reasons and legacy/native aliases without discarding the
 * original evidence. Adapter context disambiguates old generic hook codes.
 */
export function canonicalizeErrorReason(value, context = {}) {
  const values = value && typeof value === 'object'
    ? [value.reason, value.code, value.message]
    : [value];
  for (const raw of values) {
    const candidate = token(raw);
    if (!candidate) continue;
    if (ERROR_REASON_POLICY[candidate]) return candidate;
    const lowered = candidate.toLowerCase();
    if (ERROR_REASON_POLICY[lowered]) return lowered;
    if (candidate === 'AGENTSAM_HOOK_TIMEOUT' && context.adapter) {
      const specific = `hook_${clean(context.adapter).toLowerCase()}_timeout`;
      if (ERROR_REASON_POLICY[specific]) return specific;
    }
    const alias = ERROR_REASON_ALIASES[candidate] || ERROR_REASON_ALIASES[lowered] || ERROR_REASON_ALIASES[candidate.toUpperCase()];
    if (alias) return alias;
  }
  return null;
}

function reasonFromHttpStatus(status) {
  if (status === 400 || status === 422) return ERROR_REASON.INPUT_INVALID;
  if (status === 401) return ERROR_REASON.AUTH_INVALID;
  if (status === 403) return ERROR_REASON.PERMISSION_DENIED;
  if (status === 404) return ERROR_REASON.TARGET_NOT_FOUND;
  if (status === 408 || status === 504) return ERROR_REASON.TRANSPORT_TIMEOUT;
  if (status === 409) return ERROR_REASON.CONFLICT;
  if (status === 412) return ERROR_REASON.PRECONDITION_FAILED;
  if (status === 429) return ERROR_REASON.RATE_LIMITED;
  if (status === 501) return ERROR_REASON.UNSUPPORTED_OPERATION;
  if ([502, 503, 520, 521, 522, 523, 525, 526, 530].includes(status)) return ERROR_REASON.TRANSPORT_UNREACHABLE;
  return ERROR_REASON.INTERNAL;
}

export function normalizeError(error, context = {}) {
  if (isErrorEnvelope(error)) return error;
  if (error instanceof AgentSamError) return error.envelope;
  if (isErrorEnvelope(error?.envelope)) return error.envelope;
  if (isErrorEnvelope(error?.error)) return error.error;
  const status = Number(error?.status || error?.http_status || context.http_status || 0) || null;
  const recoveredReason = canonicalizeErrorReason(context.reason, context)
    || canonicalizeErrorReason(error, context);
  const reason = recoveredReason || (status ? reasonFromHttpStatus(status) : ERROR_REASON.INTERNAL);
  // A known reason owns its broad canonical code. HTTP status only selects a
  // broad fallback reason when no machine reason or alias was recovered.
  const canonical = clean(context.code)
    || (ERROR_REASON_POLICY[reason] ? undefined : (status ? canonicalCodeFromHttpStatus(status) : undefined));
  return createErrorEnvelope({
    ...context,
    code: canonical,
    reason,
    message: context.message || error?.message || String(error || 'Unknown error'),
    http_status: status,
    native: context.native || {
      code: error?.code || null,
      exception_type: error?.name || null,
      stack: error?.stack || null,
    },
    source: context.source || { kind: 'agentsam', name: 'agentsam-sdk' },
    resolution_owner: context.resolution_owner,
    severity: context.severity,
    remediation: context.remediation,
  });
}
