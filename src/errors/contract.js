// Compatibility facade. Canonical runtime ownership lives in packages/agentsam-errors.
import {
  ERROR_CODE,
  ERROR_REASON,
} from '../../packages/agentsam-errors/src/vocabulary.js';
import { canonicalCodeFromHttpStatus } from '../../packages/agentsam-errors/src/envelope.js';

export {
  ERROR_SCHEMA_VERSION,
  ERROR_CODE,
  ERROR_REASON,
  ERROR_SEVERITY,
  ERROR_SOURCE_KIND,
  ERROR_RESOLUTION_OWNER,
  ERROR_DOMAIN,
  REMEDIATION_ACTION,
  GRPC_STATUS,
} from '../../packages/agentsam-errors/src/vocabulary.js';

export {
  canonicalCodeFromHttpStatus,
  canonicalCodeFromGrpcStatus,
  defaultHttpStatusForCode,
  grpcStatusForCode,
  createErrorEnvelope,
  isErrorEnvelope,
  assertErrorEnvelope,
  serializeError,
  parseError,
} from '../../packages/agentsam-errors/src/envelope.js';

// Legacy compact classifier shapes remain public here; richer envelope classifiers
// live in packages/agentsam-errors and are available via the other adapter exports.
export function classifyCloudflareFailure({ httpStatus, cloudflareCode } = {}) {
  const status = Number(httpStatus || 0) || null;
  const cf = Number(cloudflareCode || 0) || null;
  if (cf === 1033) return { code: ERROR_CODE.UNAVAILABLE, reason: ERROR_REASON.TUNNEL_CONNECTOR_UNAVAILABLE, retryable: true };
  if (status === 521) return { code: ERROR_CODE.UNAVAILABLE, reason: ERROR_REASON.TRANSPORT_REFUSED, retryable: true };
  if (status === 522 || status === 523) return { code: ERROR_CODE.UNAVAILABLE, reason: ERROR_REASON.TRANSPORT_UNREACHABLE, retryable: true };
  if (status === 524) return { code: ERROR_CODE.DEADLINE_EXCEEDED, reason: ERROR_REASON.TRANSPORT_TIMEOUT, retryable: true };
  if (status === 525) return { code: ERROR_CODE.UNAVAILABLE, reason: ERROR_REASON.TLS_HANDSHAKE_FAILED, retryable: false };
  if (status === 526) return { code: ERROR_CODE.UNAVAILABLE, reason: ERROR_REASON.TLS_CERTIFICATE_INVALID, retryable: false };
  if (status === 520 || status === 502) return { code: ERROR_CODE.UNAVAILABLE, reason: ERROR_REASON.UPSTREAM_INVALID_RESPONSE, retryable: true };
  if (status === 530) return { code: ERROR_CODE.UNAVAILABLE, reason: ERROR_REASON.TRANSPORT_UNREACHABLE, retryable: true };
  return { code: canonicalCodeFromHttpStatus(status), reason: ERROR_REASON.UNKNOWN, retryable: status != null && status >= 500 };
}

export function classifyOAuthFailure(error) {
  switch (String(error || '').toLowerCase()) {
    case 'invalid_client':
    case 'invalid_grant': return { code: ERROR_CODE.UNAUTHENTICATED, reason: ERROR_REASON.AUTH_INVALID, retryable: false };
    case 'unauthorized_client':
    case 'access_denied': return { code: ERROR_CODE.PERMISSION_DENIED, reason: ERROR_REASON.PERMISSION_DENIED, retryable: false };
    case 'invalid_scope':
    case 'invalid_request':
    case 'unsupported_grant_type': return { code: ERROR_CODE.INVALID_ARGUMENT, reason: ERROR_REASON.INPUT_INVALID, retryable: false };
    default: return { code: ERROR_CODE.UNKNOWN, reason: ERROR_REASON.UNKNOWN, retryable: false };
  }
}
